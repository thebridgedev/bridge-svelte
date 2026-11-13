/**
 * Plain JSON calls to a Bridge server, for the stage adapter and the run's
 * preparation. Retries a cold function (502 to 504) and waits out the
 * per-address limit, as any client does. Never logs a header or a body.
 */
export interface Answer {
	readonly status: number;
	readonly body: Record<string, unknown>;
	readonly text: string;
}

export type Request = (method: string, path: string, headers?: Record<string, string>, body?: unknown) => Promise<Answer>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function bridgeRequest(base: string): Request {
	const root = base.replace(/\/+$/, '');
	return async (method, path, headers = {}, body) => {
		let last: Answer | Error = new Error('not sent');
		let waited = 0;
		for (let attempt = 1; attempt <= 6; attempt++) {
			try {
				const response = await fetch(`${root}${path}`, {
					method,
					headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
					...(body === undefined ? {} : { body: JSON.stringify(body) }),
					signal: AbortSignal.timeout(30_000),
				});
				const text = await response.text();
				let parsed: unknown;
				try {
					parsed = text === '' ? {} : JSON.parse(text);
				} catch {
					parsed = { text: text.slice(0, 200) };
				}
				const answer: Answer = {
					status: response.status,
					body: (typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed }) as Record<string, unknown>,
					text,
				};
				if (answer.status === 429 && waited < 2) {
					waited += 1;
					attempt -= 1;
					await sleep((Number(response.headers.get('retry-after') ?? 30) + 1) * 1000);
					continue;
				}
				if (![502, 503, 504].includes(answer.status)) return answer;
				last = answer;
			} catch (error) {
				last = error instanceof Error ? error : new Error(String(error));
			}
			await sleep(5_000);
		}
		if (last instanceof Error) throw last;
		return last;
	};
}

export function expectStatus(answer: Answer, statuses: number | readonly number[], what: string): Answer {
	const wanted = typeof statuses === 'number' ? [statuses] : statuses;
	if (!wanted.includes(answer.status)) throw new Error(`${what} answered ${answer.status}, not ${wanted.join(' or ')}: ${answer.text.slice(0, 300)}`);
	return answer;
}
