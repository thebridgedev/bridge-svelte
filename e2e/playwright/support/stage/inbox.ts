import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { simpleParser } from 'mailparser';

/**
 * The stage test inbox: mail to any address at the test domain is written to a
 * bucket, one object per message. This reads it, read only, with the
 * credentials of the machine running the tests. Where the bucket is comes
 * from the run's manifest.
 */
export interface InboxSettings {
	readonly bucket: string;
	readonly region: string;
	readonly domain: string;
}

export interface Mail {
	readonly key: string;
	readonly to: readonly string[];
	readonly subject: string;
	/** Every link in the message, in order. */
	readonly links: readonly string[];
}

/** A link Bridge sends with a one-time secret: `<page>#bridge=<step>&token=…`. */
export function bridgeLink(mail: Pick<Mail, 'links'>): { readonly url: string; readonly step: string; readonly token: string } | null {
	for (const url of mail.links) {
		const hash = url.indexOf('#');
		if (hash < 0) continue;
		const fragment = new URLSearchParams(url.slice(hash + 1));
		const step = fragment.get('bridge');
		const token = fragment.get('token');
		if (step && token) return { url, step, token };
	}
	return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class Inbox {
	private readonly client: S3Client;
	private readonly read = new Map<string, Mail>();
	constructor(private readonly settings: InboxSettings) {
		this.client = new S3Client({ region: settings.region });
	}

	/** Reads what arrived since `after` (less a minute of clock difference) and is not read yet. */
	private async fetch(after: Date): Promise<void> {
		let token: string | undefined;
		do {
			const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.settings.bucket, Prefix: 'mail/', ...(token ? { ContinuationToken: token } : {}) }));
			for (const object of page.Contents ?? []) {
				const key = object.Key;
				if (!key || key.startsWith('mail/webhooks/') || this.read.has(key)) continue;
				if ((object.LastModified?.getTime() ?? 0) < after.getTime() - 60_000) continue;
				const body = await this.client.send(new GetObjectCommand({ Bucket: this.settings.bucket, Key: key }));
				const parsed = await simpleParser(Buffer.from(await body.Body!.transformToByteArray()));
				const text = parsed.text ?? '';
				const html = typeof parsed.html === 'string' ? parsed.html : '';
				const hrefs = [...html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => (m[1] ?? m[2] ?? '').replace(/&amp;/g, '&').trim());
				const written = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((m) => m[0].replace(/[.,;:!?]+$/, ''));
				const addresses = [parsed.to, parsed.cc].flatMap((field) => (field === undefined ? [] : Array.isArray(field) ? field : [field])).flatMap((field) => field.value.map((each) => (each.address ?? '').toLowerCase()));
				this.read.set(key, {
					key,
					to: addresses,
					subject: parsed.subject ?? '',
					links: [...new Set([...hrefs, ...written].filter((link) => /^https?:\/\//i.test(link)))],
				});
			}
			token = page.IsTruncated ? page.NextContinuationToken : undefined;
		} while (token);
	}

	/** The first message to `address`, arrived since `after`, that `accept` takes. */
	async waitFor(address: string, after: Date, accept: (mail: Mail) => boolean = () => true, timeoutMs = 120_000): Promise<Mail> {
		const wanted = address.toLowerCase();
		const until = Date.now() + timeoutMs;
		for (;;) {
			await this.fetch(after);
			const found = [...this.read.values()].find((mail) => mail.to.includes(wanted) && accept(mail));
			if (found) return found;
			if (Date.now() >= until) {
				const others = [...this.read.values()].filter((mail) => mail.to.includes(wanted)).map((mail) => `"${mail.subject}"`);
				throw new Error(`no message to ${address} reached the test inbox within ${Math.round(timeoutMs / 1000)} s${others.length ? `; the others to it: ${others.join(', ').slice(0, 300)}` : ''}`);
			}
			await sleep(3_000);
		}
	}
}
