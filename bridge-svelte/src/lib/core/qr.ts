/**
 * A small QR code encoder, for the authenticator app's setup: the `otpauth://` address is drawn here, in the page, and
 * never sent anywhere to be drawn. Byte mode, error correction M (or another level), versions 1 to 40, the mask with the
 * lowest penalty, as ISO/IEC 18004 describes. It encodes only; the page draws the modules as an SVG.
 */

export type QrLevel = 'L' | 'M' | 'Q' | 'H';

const LEVEL_BITS: Readonly<Record<QrLevel, number>> = { L: 1, M: 0, Q: 3, H: 2 };
// Per level, per version (index 0 unused): error correction codewords per block, and the number of blocks.
const ECC_PER_BLOCK: Readonly<Record<QrLevel, readonly number[]>> = {
	L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
	Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
	H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
const BLOCKS: Readonly<Record<QrLevel, readonly number[]>> = {
	L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
	M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
	Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
	H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

/** All modules of a version, minus the function patterns: what data and error correction fill. */
function rawModules(version: number): number {
	let result = (16 * version + 128) * version + 64;
	if (version >= 2) {
		const align = Math.floor(version / 7) + 2;
		result -= (25 * align - 10) * align - 55;
		if (version >= 7) result -= 36;
	}
	return result;
}

const dataCodewords = (version: number, level: QrLevel) => Math.floor(rawModules(version) / 8) - (ECC_PER_BLOCK[level][version] as number) * (BLOCKS[level][version] as number);

function gfMultiply(x: number, y: number): number {
	let z = 0;
	for (let i = 7; i >= 0; i--) {
		z = (z << 1) ^ ((z >>> 7) * 0x11d);
		z ^= ((y >>> i) & 1) * x;
	}
	return z & 0xff;
}

function rsDivisor(degree: number): number[] {
	const result = new Array<number>(degree).fill(0);
	result[degree - 1] = 1;
	let root = 1;
	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < result.length; j++) {
			result[j] = gfMultiply(result[j] as number, root);
			if (j + 1 < result.length) result[j] = (result[j] as number) ^ (result[j + 1] as number);
		}
		root = gfMultiply(root, 0x02);
	}
	return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
	const result = divisor.map(() => 0);
	for (const b of data) {
		const factor = b ^ (result.shift() as number);
		result.push(0);
		divisor.forEach((coef, i) => (result[i] = (result[i] as number) ^ gfMultiply(coef, factor)));
	}
	return result;
}

function alignmentPositions(version: number): number[] {
	if (version === 1) return [];
	const count = Math.floor(version / 7) + 2;
	const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
	const result = [6];
	for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
	return result;
}

/** A QR code: `size` × `size` modules, `true` for dark. */
export interface QrCode {
	readonly version: number;
	readonly size: number;
	readonly mask: number;
	readonly modules: readonly (readonly boolean[])[];
}

/**
 * Encodes `text` (as UTF-8 bytes) in the smallest version that holds it at `level`. `mask` forces one mask pattern (0 to
 * 7), for tests; by default the one with the lowest penalty.
 */
export function encodeQr(text: string, level: QrLevel = 'M', options: { readonly mask?: number; readonly minVersion?: number } = {}): QrCode {
	const bytes = [...new TextEncoder().encode(text)];
	let version = Math.max(1, options.minVersion ?? 1);
	for (; ; version++) {
		if (version > 40) throw new RangeError('The text is too long for a QR code.');
		const countBits = version <= 9 ? 8 : 16;
		if (4 + countBits + bytes.length * 8 <= dataCodewords(version, level) * 8) break;
	}
	// The bit stream: byte mode, the count, the bytes, the terminator, padding.
	const bits: number[] = [];
	const put = (value: number, length: number) => {
		for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
	};
	put(0b0100, 4);
	put(bytes.length, version <= 9 ? 8 : 16);
	for (const b of bytes) put(b, 8);
	const capacity = dataCodewords(version, level) * 8;
	put(0, Math.min(4, capacity - bits.length));
	put(0, (8 - (bits.length % 8)) % 8);
	for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
	const data: number[] = [];
	for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));

	// Blocks with their error correction, interleaved.
	const blockCount = BLOCKS[level][version] as number;
	const eccLength = ECC_PER_BLOCK[level][version] as number;
	const raw = Math.floor(rawModules(version) / 8);
	const shortBlocks = blockCount - (raw % blockCount);
	const shortLength = Math.floor(raw / blockCount);
	const divisor = rsDivisor(eccLength);
	const blocks: number[][] = [];
	for (let i = 0, k = 0; i < blockCount; i++) {
		const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
		const chunk = data.slice(k, k + length);
		k += length;
		const ecc = rsRemainder(chunk, divisor);
		if (i < shortBlocks) chunk.push(0);
		blocks.push([...chunk, ...ecc]);
	}
	const codewords: number[] = [];
	for (let i = 0; i < (blocks[0] as number[]).length; i++) {
		blocks.forEach((block, j) => {
			if (i !== shortLength - eccLength || j >= shortBlocks) codewords.push(block[i] as number);
		});
	}

	const size = version * 4 + 17;
	const dark: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
	const fixed: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
	const set = (x: number, y: number, on: boolean) => {
		(dark[y] as boolean[])[x] = on;
		(fixed[y] as boolean[])[x] = true;
	};
	// Timing patterns, finders, alignment patterns.
	for (let i = 0; i < size; i++) {
		set(6, i, i % 2 === 0);
		set(i, 6, i % 2 === 0);
	}
	const finder = (cx: number, cy: number) => {
		for (let dy = -4; dy <= 4; dy++)
			for (let dx = -4; dx <= 4; dx++) {
				const d = Math.max(Math.abs(dx), Math.abs(dy));
				const x = cx + dx;
				const y = cy + dy;
				if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
			}
	};
	finder(3, 3);
	finder(size - 4, 3);
	finder(3, size - 4);
	const align = alignmentPositions(version);
	for (let i = 0; i < align.length; i++)
		for (let j = 0; j < align.length; j++) {
			if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
			for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set((align[i] as number) + dx, (align[j] as number) + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
		}
	const drawFormat = (mask: number) => {
		const value = (LEVEL_BITS[level] << 3) | mask;
		let rem = value;
		for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
		const format = ((value << 10) | rem) ^ 0x5412;
		const bit = (i: number) => ((format >>> i) & 1) !== 0;
		for (let i = 0; i <= 5; i++) set(8, i, bit(i));
		set(8, 7, bit(6));
		set(8, 8, bit(7));
		set(7, 8, bit(8));
		for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
		for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
		for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
		set(8, size - 8, true);
	};
	drawFormat(0);
	if (version >= 7) {
		let rem = version;
		for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
		const value = (version << 12) | rem;
		for (let i = 0; i < 18; i++) {
			const on = ((value >>> i) & 1) !== 0;
			const a = size - 11 + (i % 3);
			const b = Math.floor(i / 3);
			set(a, b, on);
			set(b, a, on);
		}
	}
	// The data, in the zigzag.
	let index = 0;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let vert = 0; vert < size; vert++)
			for (let j = 0; j < 2; j++) {
				const x = right - j;
				const upward = ((right + 1) & 2) === 0;
				const y = upward ? size - 1 - vert : vert;
				if (!(fixed[y] as boolean[])[x] && index < codewords.length * 8) {
					(dark[y] as boolean[])[x] = (((codewords[index >>> 3] as number) >>> (7 - (index & 7))) & 1) !== 0;
					index++;
				}
			}
	}

	const masked = (mask: number): boolean[][] => {
		const out = dark.map((row) => [...row]);
		for (let y = 0; y < size; y++)
			for (let x = 0; x < size; x++) {
				if ((fixed[y] as boolean[])[x]) continue;
				const flip = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mask];
				if (flip) (out[y] as boolean[])[x] = !(out[y] as boolean[])[x];
			}
		return out;
	};
	const withFormat = (grid: boolean[][], mask: number): boolean[][] => {
		const saved = dark.map((row) => [...row]);
		drawFormat(mask);
		const out = grid.map((row, y) => row.map((on, x) => ((fixed[y] as boolean[])[x] ? (dark[y] as boolean[])[x] as boolean : on)));
		saved.forEach((row, y) => (dark[y] = row));
		return out;
	};
	let best = options.mask ?? -1;
	let chosen: boolean[][] | null = null;
	if (best >= 0) chosen = withFormat(masked(best), best);
	else {
		let lowest = Infinity;
		for (let mask = 0; mask < 8; mask++) {
			const grid = withFormat(masked(mask), mask);
			const score = penalty(grid);
			if (score < lowest) {
				lowest = score;
				best = mask;
				chosen = grid;
			}
		}
	}
	return { version, size, mask: best, modules: chosen as boolean[][] };
}

/** The penalty of ISO/IEC 18004 7.8.3: runs, 2×2 blocks, finder-like patterns, and the balance of dark modules. */
function penalty(grid: readonly (readonly boolean[])[]): number {
	const size = grid.length;
	let result = 0;
	const lines = (get: (i: number, j: number) => boolean) => {
		for (let i = 0; i < size; i++) {
			let run = 1;
			const seq: boolean[] = [];
			for (let j = 0; j < size; j++) {
				const on = get(i, j);
				seq.push(on);
				if (j > 0 && on === get(i, j - 1)) {
					run++;
					if (run === 5) result += 3;
					else if (run > 5) result++;
				} else run = 1;
			}
			const pattern = [true, false, true, true, true, false, true];
			for (let j = 0; j + 7 <= size; j++) {
				if (!pattern.every((on, k) => seq[j + k] === on)) continue;
				const before = j >= 4 && seq.slice(j - 4, j).every((on) => !on);
				const after = j + 11 <= size && seq.slice(j + 7, j + 11).every((on) => !on);
				const edgeBefore = j === 0 || (j < 4 && seq.slice(0, j).every((on) => !on));
				const edgeAfter = j + 7 === size || (j + 11 > size && seq.slice(j + 7).every((on) => !on));
				if (before || after || edgeBefore || edgeAfter) result += 40;
			}
		}
	};
	lines((i, j) => grid[i]![j]!);
	lines((i, j) => grid[j]![i]!);
	for (let y = 0; y + 1 < size; y++)
		for (let x = 0; x + 1 < size; x++) {
			const on = grid[y]![x];
			if (on === grid[y]![x + 1] && on === grid[y + 1]![x] && on === grid[y + 1]![x + 1]) result += 3;
		}
	const darkCount = grid.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
	const total = size * size;
	result += (Math.ceil(Math.abs(darkCount * 20 - total * 10) / total) - 1) * 10;
	return result;
}

/** The code as an SVG path (one `M x y h1 v1 h-1 z` per dark module), with a quiet zone of `margin` modules. */
export function qrPath(code: QrCode, margin = 4): { readonly path: string; readonly viewBox: string } {
	let path = '';
	code.modules.forEach((row, y) => row.forEach((on, x) => (path += on ? `M${x + margin} ${y + margin}h1v1h-1z` : '')));
	const full = code.size + margin * 2;
	return { path, viewBox: `0 0 ${full} ${full}` };
}
