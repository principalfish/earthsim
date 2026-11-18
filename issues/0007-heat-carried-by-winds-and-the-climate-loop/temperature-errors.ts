/**
 * Where the simulated Earth (64 grid) is most wrong against the observed.
 * Run from the repo root:
 *   node scripts/run-with-vite.mjs <this file>
 */
import { stdout } from 'node:process';
import {
	cellAt,
	decodeEarth,
	decodeObservedTemperature,
	directionToLatLon,
	earthWorld,
	getGrid,
	latLonToDirection,
	observedTemperature,
	solveTemperature,
} from '/home/philiph/workspace/earth_sim/src/core/index';
import {
	readEarthDataFile,
	readObservedTemperatureFile,
} from '/home/philiph/workspace/earth_sim/scripts/earth/dataFile.mjs';

const say = (s = '') => stdout.write(`${s}\n`);
const RES = 64;

export const main = (): void => {
	const world = earthWorld(decodeEarth(readEarthDataFile()), RES);
	const grid = getGrid(RES);
	const result = solveTemperature(world);
	const sim = result.months;
	const obs = observedTemperature(
		decodeObservedTemperature(readObservedTemperatureFile()),
		RES,
	);
	const N = grid.cellCount;
	const lat = new Float64Array(N);
	const lon = new Float64Array(N);
	const land = new Uint8Array(N);
	const elev = new Float64Array(N);
	for (let c = 0; c < N; c++) {
		const d = [grid.centres[3 * c]!, grid.centres[3 * c + 1]!, grid.centres[3 * c + 2]!] as const;
		const ll = directionToLatLon(d);
		lat[c] = ll.latitudeDeg;
		lon[c] = ll.longitudeDeg;
		land[c] = world.elevation[c]! > world.seaLevel ? 1 : 0;
		elev[c] = Math.max(0, world.elevation[c]! - world.seaLevel);
	}
	// Fields: 'ann', 'jan', 'jul', and each cell's diff.
	const annS = new Float64Array(N);
	const annO = new Float64Array(N);
	const minO = new Float64Array(N).fill(1e9);
	for (let m = 0; m < 12; m++)
		for (let c = 0; c < N; c++) {
			annS[c] += sim[m]![c]! / 12;
			annO[c] += obs[m]![c]! / 12;
			minO[c] = Math.min(minO[c]!, obs[m]![c]!);
		}
	const fields = {
		ann: { s: annS, o: annO },
		jan: { s: sim[0]!, o: obs[0]! },
		jul: { s: sim[6]!, o: obs[6]! },
	};
	type Key = keyof typeof fields;
	const stat = (pick: (c: number) => boolean, k: Key) => {
		let a = 0, sd = 0, sq = 0, ss = 0, so = 0;
		const { s, o } = fields[k];
		for (let c = 0; c < N; c++) {
			if (!pick(c)) continue;
			const w = grid.areas[c]!;
			const d = s[c]! - o[c]!;
			a += w; sd += w * d; sq += w * d * d; ss += w * s[c]!; so += w * o[c]!;
		}
		return { area: a, mean: sd / a, rms: Math.sqrt(sq / a), sim: ss / a, obs: so / a };
	};
	const f = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
	const cell3 = (pick: (c: number) => boolean) =>
		(['ann', 'jan', 'jul'] as Key[]).map((k) => {
			const r = stat(pick, k);
			return `${f(r.mean)} (${r.rms.toFixed(1)})`;
		});
	const tbl = (h: string[], rows: string[][]) => {
		say(`| ${h.join(' | ')} |`);
		say(`|${h.map(() => '-').join('|')}|`);
		for (const r of rows) say(`| ${r.join(' | ')} |`);
		say();
	};
	const globalAll = stat(() => true, 'ann');
	say(`Global annual: mean ${f(globalAll.mean)} rms ${globalAll.rms.toFixed(2)}; converged ${result.converged}, years ${result.yearsRun}`);
	say();

	// Bands
	say('## Bands: mean (rms), annual | Jan | Jul');
	const edges = [90, 75, 60, 45, 30, 15, 0, -15, -30, -45, -60, -75, -90];
	const rows: string[][] = [];
	for (let i = 0; i < edges.length - 1; i++) {
		const hi = edges[i]!, lo = edges[i + 1]!;
		const inB = (c: number) => lat[c]! < hi && lat[c]! >= lo;
		const nm = `${lo}..${hi}`;
		const lf = stat((c) => inB(c) && land[c] === 1, 'ann').area / stat(inB, 'ann').area;
		rows.push([
			nm,
			(lf * 100).toFixed(0),
			...cell3((c) => inB(c) && land[c] === 1),
			...cell3((c) => inB(c) && land[c] === 0),
		]);
	}
	tbl(['band', 'land%', 'land ann', 'land Jan', 'land Jul', 'sea ann', 'sea Jan', 'sea Jul'], rows);
	say('All land: ' + cell3((c) => land[c] === 1).join(' | '));
	say('All sea: ' + cell3((c) => land[c] === 0).join(' | '));
	say();

	const box = (la0: number, la1: number, lo0: number, lo1: number) => (c: number) =>
		lat[c]! >= la0 && lat[c]! <= la1 && lon[c]! >= lo0 && lon[c]! <= lo1;
	const L = (p: (c: number) => boolean) => (c: number) => p(c) && land[c] === 1;
	const S = (p: (c: number) => boolean) => (c: number) => p(c) && land[c] === 0;
	const regions: [string, (c: number) => boolean][] = [
		['Western Europe 42-60N 10W-15E land', L(box(42, 60, -10, 15))],
		['E North America 35-50N 85-65W land', L(box(35, 50, -85, -65))],
		['W coast N America 38-60N 135-118W land', L(box(38, 60, -135, -118))],
		['East Asia 25-45N 105-145E land', L(box(25, 45, 105, 145))],
		['Siberian interior 50-70N 90-130E land', L(box(50, 70, 90, 130))],
		['Central N America 35-55N 105-90W land', L(box(35, 55, -105, -90))],
		['N Atlantic 50-65N 45W-0 sea', S(box(50, 65, -45, 0))],
		['Norwegian/Barents Sea 65-78N 0-50E sea', S(box(65, 78, 0, 50))],
		['Southern Ocean 55-70S sea', S(box(-70, -55, -180, 180))],
		['Antarctica land', (c) => land[c] === 1 && lat[c]! < -60],
		['Greenland land', L(box(59, 84, -75, -10))],
		['Arctic Ocean >75N sea', S(box(75, 90, -180, 180))],
		['Himalaya-Tibet 27-40N 75-103E land', L(box(27, 40, 75, 103))],
		['Andes 40S-10N 80-65W land >1500m', (c) => L(box(-40, 10, -80, -65))(c) && elev[c]! > 1500],
		['Sahara 16-32N 15W-35E land', L(box(16, 32, -15, 35))],
		['Amazonia 15S-5N 75-45W land', L(box(-15, 5, -75, -45))],
		['E tropical Pacific 20S-5N 120-75W sea', S(box(-20, 5, -120, -75))],
		['Kuroshio/NW Pacific 30-45N 140-170E sea', S(box(30, 45, 140, 170))],
	];
	say('## Regions: mean (rms) K, annual | Jan | Jul ; obs annual / sim annual');
	tbl(['region', 'ann', 'Jan', 'Jul', 'obs ann', 'sim ann'], regions.map(([n, p]) => {
		const a = stat(p, 'ann');
		return [n, ...cell3(p), a.obs.toFixed(1), a.sim.toFixed(1)];
	}));

	// West vs east coast at 40-60N.
	const isLandAt = (la: number, lo: number) => land[cellAt(grid, latLonToDirection(la, lo))] === 1;
	const seaTo = (c: number, sign: number) => {
		for (const k of [1.5, 3]) if (!isLandAt(lat[c]!, lon[c]! + sign * k)) return true;
		return false;
	};
	const west = new Uint8Array(N), east = new Uint8Array(N);
	for (let c = 0; c < N; c++) {
		if (land[c] !== 1 || lat[c]! < 40 || lat[c]! > 60 || elev[c]! > 1000) continue;
		const w = seaTo(c, -1), e = seaTo(c, +1);
		if (w && !e) west[c] = 1;
		if (e && !w) east[c] = 1;
	}
	const sectors: [string, number, number][] = [
		['Europe', -15, 30], ['NA west', -170, -110], ['NA east', -100, -50], ['Asia east', 100, 170],
	];
	say('## Coastal land 40-60N (<1000 m): sim / obs (error)');
	const cr: string[][] = [];
	for (const [nm, lo0, lo1] of sectors)
		for (const [side, mask] of [['west', west], ['east', east]] as const) {
			const p = (c: number) => mask[c] === 1 && lon[c]! >= lo0 && lon[c]! <= lo1;
			if (stat(p, 'ann').area === 0 || Number.isNaN(stat(p, 'ann').mean)) continue;
			let n = 0; for (let c = 0; c < N; c++) if (p(c)) n++;
			if (n < 3) continue;
			cr.push([`${nm} ${side}-facing (${n})`, ...(['ann', 'jan', 'jul'] as Key[]).map((k) => {
				const r = stat(p, k); return `${r.sim.toFixed(1)} / ${r.obs.toFixed(1)} (${f(r.mean)})`;
			})]);
		}
	tbl(['coast', 'ann', 'Jan', 'Jul'], cr);
	const pairStat = (pw: (c: number) => boolean, pe: (c: number) => boolean, label: string) => {
		const out = (['ann', 'jan', 'jul'] as Key[]).map((k) => {
			const a = stat(pw, k), b = stat(pe, k);
			return `${f(a.sim - b.sim)} / ${f(a.obs - b.obs)}`;
		});
		return [label, ...out];
	};
	tbl(['W minus E, sim / obs', 'ann', 'Jan', 'Jul'], [
		pairStat((c) => west[c] === 1 && lon[c]! >= -15 && lon[c]! <= 30, (c) => east[c] === 1 && lon[c]! >= 100, 'Europe W vs Asia E'),
		pairStat((c) => west[c] === 1 && lon[c]! <= -110, (c) => east[c] === 1 && lon[c]! >= -100 && lon[c]! <= -50, 'NA W vs NA E'),
		pairStat((c) => west[c] === 1, (c) => east[c] === 1, 'all W vs all E'),
	]);

	// Interior: continental vs maritime at 45-60N, annual range
	// Shares of squared error by category.
	const cat = new Uint8Array(N);
	const names = ['ice sheet', 'high ground >1500m', 'sea-ice zone (obs coldest month < -1.5C sea)', 'N Atlantic/Nordic/Barents sea 40-80N 70W-60E', 'other sea', 'mid/high-lat low land 30-75', 'tropical/subtropical low land <30', 'other land'];
	for (let c = 0; c < N; c++) {
		const la = lat[c]!, lo = lon[c]!;
		if (land[c] === 1) {
			if (la < -60 || box(59, 84, -75, -10)(c)) cat[c] = 0;
			else if (elev[c]! > 1500) cat[c] = 1;
			else if (Math.abs(la) >= 30 && Math.abs(la) < 75) cat[c] = 5;
			else if (Math.abs(la) < 30) cat[c] = 6;
			else cat[c] = 7;
		} else {
			if (minO[c]! < -1.5) cat[c] = 2;
			else if (la >= 40 && la <= 80 && lo >= -70 && lo <= 60) cat[c] = 3;
			else cat[c] = 4;
		}
	}
	const sq = (k: Key | 'all') => {
		const tot = new Float64Array(names.length), area = new Float64Array(names.length), sum = new Float64Array(names.length);
		for (let c = 0; c < N; c++) {
			const w = grid.areas[c]!;
			let e2 = 0, e = 0;
			if (k === 'all') { for (let m = 0; m < 12; m++) { const d = sim[m]![c]! - obs[m]![c]!; e2 += d * d / 12; e += d / 12; } }
			else { const d = fields[k].s[c]! - fields[k].o[c]!; e2 = d * d; e = d; }
			tot[cat[c]!] += w * e2; area[cat[c]!] += w; sum[cat[c]!] += w * e;
		}
		return { tot, area, sum };
	};
	say('## Share of area-weighted squared error by category');
	const A = sq('ann'), J = sq('jan'), Y = sq('jul'), M = sq('all');
	const T = (x: Float64Array) => x.reduce((a, b) => a + b, 0);
	const ta = T(A.area);
	tbl(['category', 'area%', 'ann share% (mean)', 'Jan share% (mean)', 'Jul share% (mean)', 'all-month MSE share%'], names.map((n, i) => [
		n, (A.area[i]! / ta * 100).toFixed(0),
		...[A, J, Y].map((s) => `${(s.tot[i]! / T(s.tot) * 100).toFixed(0)} (${f(s.sum[i]! / s.area[i]!)})`),
		(M.tot[i]! / T(M.tot) * 100).toFixed(0),
	]));

	// Worst cells, annual
	const idx = [...Array(N).keys()].sort((a, b) => Math.abs(annS[b]! - annO[b]!) - Math.abs(annS[a]! - annO[a]!));
	say('## Worst 15 cells annual');
	tbl(['lat', 'lon', 'land', 'elev', 'err ann', 'err Jan', 'err Jul'], idx.slice(0, 15).map((c) => [
		lat[c]!.toFixed(1), lon[c]!.toFixed(1), land[c] ? 'L' : 'S', elev[c]!.toFixed(0), f(annS[c]! - annO[c]!), f(sim[0]![c]! - obs[0]![c]!), f(sim[6]![c]! - obs[6]![c]!),
	]));
	const idxJ = [...Array(N).keys()].sort((a, b) => Math.abs(sim[0]![b]! - obs[0]![b]!) - Math.abs(sim[0]![a]! - obs[0]![a]!));
	say('## Worst 15 cells January');
	tbl(['lat', 'lon', 'land', 'elev', 'err ann', 'err Jan', 'err Jul'], idxJ.slice(0, 15).map((c) => [
		lat[c]!.toFixed(1), lon[c]!.toFixed(1), land[c] ? 'L' : 'S', elev[c]!.toFixed(0), f(annS[c]! - annO[c]!), f(sim[0]![c]! - obs[0]![c]!), f(sim[6]![c]! - obs[6]![c]!),
	]));
};
