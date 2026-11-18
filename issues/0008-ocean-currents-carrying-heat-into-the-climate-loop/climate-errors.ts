/**
 * Where the simulated Earth (64 grid) is most wrong against the observed,
 * through solveClimate (temperature + winds loop) with the shipped settings.
 * Also runs the plain solveTemperature (no winds) for comparison.
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
	solveClimate,
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
	const climate = solveClimate(world);
	const sim = climate.temperature.months;
	const plain = solveTemperature(world).months;
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
	const annS = new Float64Array(N);
	const annP = new Float64Array(N);
	const annO = new Float64Array(N);
	const minO = new Float64Array(N).fill(1e9);
	for (let m = 0; m < 12; m++)
		for (let c = 0; c < N; c++) {
			annS[c] += sim[m]![c]! / 12;
			annP[c] += plain[m]![c]! / 12;
			annO[c] += obs[m]![c]! / 12;
			minO[c] = Math.min(minO[c]!, obs[m]![c]!);
		}
	const fields = {
		ann: { s: annS, o: annO, p: annP },
		jan: { s: sim[0]!, o: obs[0]!, p: plain[0]! },
		jul: { s: sim[6]!, o: obs[6]!, p: plain[6]! },
	};
	type Key = keyof typeof fields;
	const KEYS: Key[] = ['ann', 'jan', 'jul'];
	const stat = (pick: (c: number) => boolean, k: Key) => {
		let a = 0, sd = 0, sq = 0, ss = 0, so = 0, sp = 0;
		const { s, o, p } = fields[k];
		for (let c = 0; c < N; c++) {
			if (!pick(c)) continue;
			const w = grid.areas[c]!;
			const d = s[c]! - o[c]!;
			a += w; sd += w * d; sq += w * d * d; ss += w * s[c]!; so += w * o[c]!; sp += w * (p[c]! - o[c]!);
		}
		return { area: a, mean: sd / a, rms: Math.sqrt(sq / a), sim: ss / a, obs: so / a, plain: sp / a, sq };
	};
	// All-month mean squared error per cell.
	const mse = new Float64Array(N);
	for (let c = 0; c < N; c++)
		for (let m = 0; m < 12; m++) { const d = sim[m]![c]! - obs[m]![c]!; mse[c] += d * d / 12; }
	const sqTot = (pick: (c: number) => boolean, k: Key | 'all') => {
		let t = 0;
		for (let c = 0; c < N; c++) {
			if (!pick(c)) continue;
			const w = grid.areas[c]!;
			if (k === 'all') t += w * mse[c]!;
			else { const d = fields[k].s[c]! - fields[k].o[c]!; t += w * d * d; }
		}
		return t;
	};
	const ALL = () => true;
	const totAnn = sqTot(ALL, 'ann'), totJan = sqTot(ALL, 'jan'), totAll = sqTot(ALL, 'all');
	const share = (p: (c: number) => boolean) =>
		[sqTot(p, 'ann') / totAnn, sqTot(p, 'jan') / totJan, sqTot(p, 'all') / totAll].map((x) => (x * 100).toFixed(1));

	const f = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
	const cell3 = (pick: (c: number) => boolean) =>
		KEYS.map((k) => { const r = stat(pick, k); return `${f(r.mean)} (${r.rms.toFixed(1)})`; });
	const tbl = (h: string[], rows: string[][]) => {
		say(`| ${h.join(' | ')} |`);
		say(`|${h.map(() => '-').join('|')}|`);
		for (const r of rows) say(`| ${r.join(' | ')} |`);
		say();
	};
	const isLand = (c: number) => land[c] === 1;
	const isSea = (c: number) => land[c] === 0;

	say(`solveClimate: passes ${climate.passes}, settled ${climate.settled}, last change ${climate.changeC}`);
	say();
	say('## Global: mean (rms) K, annual | Jan | Jul ; all-month rms');
	const allRms = (p: (c: number) => boolean) => {
		let a = 0, t = 0; for (let c = 0; c < N; c++) if (p(c)) { a += grid.areas[c]!; t += grid.areas[c]! * mse[c]!; }
		return Math.sqrt(t / a).toFixed(2);
	};
	tbl(['set', 'ann', 'Jan', 'Jul', 'all-month rms', 'plain (no winds) ann mean'], [
		['global', ...cell3(ALL), allRms(ALL), f(stat(ALL, 'ann').plain)],
		['sea', ...cell3(isSea), allRms(isSea), f(stat(isSea, 'ann').plain)],
		['land', ...cell3(isLand), allRms(isLand), f(stat(isLand, 'ann').plain)],
	]);
	const plainRms = (p: (c: number) => boolean, k: Key) => {
		let a = 0, t = 0; for (let c = 0; c < N; c++) if (p(c)) { const d = fields[k].p[c]! - fields[k].o[c]!; a += grid.areas[c]!; t += grid.areas[c]! * d * d; }
		return Math.sqrt(t / a).toFixed(2);
	};
	say(`Plain solveTemperature rms: global ann ${plainRms(ALL, 'ann')} Jan ${plainRms(ALL, 'jan')}; sea ann ${plainRms(isSea, 'ann')}; land ann ${plainRms(isLand, 'ann')}`);
	say();
	say('Share of global squared error (ann / Jan / all-month): sea ' + share(isSea).join(' / ') + ' ; land ' + share(isLand).join(' / '));
	say(`Area: sea ${(stat(isSea, 'ann').area / stat(ALL, 'ann').area * 100).toFixed(0)}%`);
	say();

	say('## Bands: mean (rms), annual | Jan | Jul');
	const edges = [90, 75, 60, 45, 30, 15, 0, -15, -30, -45, -60, -75, -90];
	const rows: string[][] = [];
	for (let i = 0; i < edges.length - 1; i++) {
		const hi = edges[i]!, lo = edges[i + 1]!;
		const inB = (c: number) => lat[c]! < hi && lat[c]! >= lo;
		rows.push([`${lo}..${hi}`, ...cell3((c) => inB(c) && isLand(c)), ...cell3((c) => inB(c) && isSea(c)),
			...share((c) => inB(c) && isSea(c)).slice(2), ...share((c) => inB(c) && isLand(c)).slice(2)]);
	}
	tbl(['band', 'land ann', 'land Jan', 'land Jul', 'sea ann', 'sea Jan', 'sea Jul', 'sea MSE share%', 'land MSE share%'], rows);

	const box = (la0: number, la1: number, lo0: number, lo1: number) => (c: number) =>
		lat[c]! >= la0 && lat[c]! <= la1 && lon[c]! >= lo0 && lon[c]! <= lo1;
	const L = (p: (c: number) => boolean) => (c: number) => p(c) && isLand(c);
	const S = (p: (c: number) => boolean) => (c: number) => p(c) && isSea(c);
	const isLandAt = (la: number, lo: number) => land[cellAt(grid, latLonToDirection(la, lo > 180 ? lo - 360 : lo < -180 ? lo + 360 : lo))] === 1;
	// Sea cell with land within `deg` degrees of longitude to the east (sign +1) or west (-1).
	const coastTo = (sign: number, deg: number) => (c: number) => {
		if (!isSea(c)) return false;
		for (let k = 1; k <= deg; k += 1) if (isLandAt(lat[c]!, lon[c]! + sign * k)) return true;
		return false;
	};
	const EB = coastTo(+1, 8); // land to the east: eastern boundary of an ocean
	const WB = coastTo(-1, 10); // land to the west: western boundary of an ocean
	const and = (a: (c: number) => boolean, b: (c: number) => boolean) => (c: number) => a(c) && b(c);

	const seaRegions: [string, (c: number) => boolean][] = [
		['N Atlantic 40-65N 60W-0', S(box(40, 65, -60, 0))],
		['N Atlantic 50-65N 45W-0', S(box(50, 65, -45, 0))],
		['Norwegian/Barents 65-78N 0-50E', S(box(65, 78, 0, 50))],
		['NE Pacific 40-60N 160-125W', S(box(40, 60, -160, -125))],
		['Kuroshio ext/NW Pac 30-45N 140-170E', S(box(30, 45, 140, 170))],
		['N Pacific 40-60N 150E-125W', (c) => isSea(c) && lat[c]! >= 40 && lat[c]! <= 60 && (lon[c]! >= 150 || lon[c]! <= -125)],
		['EB California 22-42N <8deg off coast', and(EB, box(22, 42, -135, -105))],
		['EB Canary 12-35N <8deg', and(EB, box(12, 35, -30, -5))],
		['EB Peru/Humboldt 5-35S <8deg', and(EB, box(-35, -5, -90, -68))],
		['EB Benguela 12-33S <8deg', and(EB, box(-33, -12, 0, 18))],
		['EB all four', (c) => and(EB, box(22, 42, -135, -105))(c) || and(EB, box(12, 35, -30, -5))(c) || and(EB, box(-35, -5, -90, -68))(c) || and(EB, box(-33, -12, 0, 18))(c)],
		['WB Gulf Stream 28-45N 82-55W', S(box(28, 45, -82, -55))],
		['WB Kuroshio 22-40N 120-150E', S(box(22, 40, 120, 150))],
		['WB Brazil 20-40S 60-35W <10deg', and(WB, box(-40, -20, -60, -35))],
		['WB Agulhas 25-42S 20-40E', S(box(-42, -25, 20, 40))],
		['WB East Australian 20-40S 150-162E', S(box(-40, -20, 150, 162))],
		['WB all five', (c) => S(box(28, 45, -82, -55))(c) || S(box(22, 40, 120, 150))(c) || and(WB, box(-40, -20, -60, -35))(c) || S(box(-42, -25, 20, 40))(c) || S(box(-40, -20, 150, 162))(c)],
		['Southern Ocean 40-55S', S(box(-55, -40, -180, 180))],
		['Southern Ocean 55-70S', S(box(-70, -55, -180, 180))],
		['Tropical oceans 20S-20N', S(box(-20, 20, -180, 180))],
		['E tropical Pacific 20S-5N 120-75W', S(box(-20, 5, -120, -75))],
		['W Pacific warm pool 10S-10N 120-170E', S(box(-10, 10, 120, 170))],
		['Tropical Atlantic 20S-20N 50W-10E', S(box(-20, 20, -50, 10))],
		['Tropical Indian 20S-20N 40-100E', S(box(-20, 20, 40, 100))],
		['Arctic Ocean >75N', S(box(75, 90, -180, 180))],
		['Sea-ice zone (obs min < -1.5)', (c) => isSea(c) && minO[c]! < -1.5],
	];
	const landRegions: [string, (c: number) => boolean][] = [
		['Western Europe 42-60N 10W-15E', L(box(42, 60, -10, 15))],
		['Scandinavia 56-71N 5-30E', L(box(56, 71, 5, 30))],
		['E North America 35-50N 85-65W', L(box(35, 50, -85, -65))],
		['East Asia 25-45N 105-145E', L(box(25, 45, 105, 145))],
		['W coast N America 38-60N 135-118W', L(box(38, 60, -135, -118))],
		['Atacama coast 15-30S 72-68W', (c) => L(box(-30, -15, -72, -68))(c) && elev[c]! < 1500],
		['Namib coast 15-28S 11-16E', L(box(-28, -15, 11, 16))],
		['Siberian interior 50-70N 90-130E', L(box(50, 70, 90, 130))],
		['Central N America 35-55N 105-90W', L(box(35, 55, -105, -90))],
		['Himalaya-Tibet 27-40N 75-103E', L(box(27, 40, 75, 103))],
		['Sahara 16-32N 15W-35E', L(box(16, 32, -15, 35))],
		['Antarctica', (c) => isLand(c) && lat[c]! < -60],
		['Greenland', L(box(59, 84, -75, -10))],
	];
	const count = (p: (c: number) => boolean) => { let n = 0; for (let c = 0; c < N; c++) if (p(c)) n++; return n; };
	const regionRows = (rs: [string, (c: number) => boolean][]) => rs.map(([n, p]) => {
		const a = stat(p, 'ann'), j = stat(p, 'jan');
		return [n, String(count(p)), ...cell3(p), f(a.plain), f(j.plain), a.obs.toFixed(1), a.sim.toFixed(1), ...share(p)];
	});
	const H = ['region', 'cells', 'ann', 'Jan', 'Jul', 'no-wind ann', 'no-wind Jan', 'obs ann', 'sim ann', 'share% ann', 'share% Jan', 'share% all-month'];
	say('## Sea regions: mean (rms) K; shares of global squared error');
	tbl(H, regionRows(seaRegions));
	say('## Land regions');
	tbl(H, regionRows(landRegions));

	// West vs east coast at 40-60N (same as the earlier script).
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
	const pairStat = (pw: (c: number) => boolean, pe: (c: number) => boolean, label: string) =>
		[label, ...KEYS.map((k) => { const a = stat(pw, k), b = stat(pe, k); return `${f(a.sim - b.sim)} / ${f(a.obs - b.obs)}`; })];
	say('## Coast contrasts 40-60N land <1000 m, W minus E, sim / obs');
	tbl(['pair', 'ann', 'Jan', 'Jul'], [
		pairStat((c) => west[c] === 1 && lon[c]! >= -15 && lon[c]! <= 30, (c) => east[c] === 1 && lon[c]! >= 100, 'Europe W vs Asia E'),
		pairStat((c) => west[c] === 1 && lon[c]! <= -110, (c) => east[c] === 1 && lon[c]! >= -100 && lon[c]! <= -50, 'NA W vs NA E'),
	]);
	const coastRows: string[][] = [];
	for (const [nm, lo0, lo1] of [['Europe', -15, 30], ['NA west', -170, -110], ['NA east', -100, -50], ['Asia east', 100, 170]] as [string, number, number][])
		for (const [side, mask] of [['west', west], ['east', east]] as const) {
			const p = (c: number) => mask[c] === 1 && lon[c]! >= lo0 && lon[c]! <= lo1;
			if (count(p) < 3) continue;
			coastRows.push([`${nm} ${side}-facing (${count(p)})`, ...KEYS.map((k) => { const r = stat(p, k); return `${r.sim.toFixed(1)} / ${r.obs.toFixed(1)} (${f(r.mean)})`; })]);
		}
	tbl(['coast', 'ann', 'Jan', 'Jul'], coastRows);

	// Partition of the all-month squared error.
	const cats: [string, (c: number) => boolean][] = [];
	const names = [
		'sea: sea-ice zone', 'sea: N Atlantic/Nordic 40-80N 70W-60E', 'sea: N Pacific 30-65N',
		'sea: eastern-boundary upwelling (4)', 'sea: western-boundary currents (5)', 'sea: Southern Ocean <40S',
		'sea: tropics 20S-20N', 'sea: other',
		'land: ice sheet', 'land: high ground >1500m', 'land: mid/high-lat low 30-75', 'land: tropical/subtropical low <30', 'land: other',
	];
	const ebAll = seaRegions.find((r) => r[0] === 'EB all four')![1];
	const wbAll = seaRegions.find((r) => r[0] === 'WB all five')![1];
	const cat = new Uint8Array(N);
	for (let c = 0; c < N; c++) {
		const la = lat[c]!, lo = lon[c]!;
		if (isSea(c)) {
			if (minO[c]! < -1.5) cat[c] = 0;
			else if (la >= 40 && la <= 80 && lo >= -70 && lo <= 60) cat[c] = 1;
			else if (la >= 30 && la <= 65 && (lo >= 120 || lo <= -100)) cat[c] = wbAll(c) ? 4 : 2;
			else if (ebAll(c)) cat[c] = 3;
			else if (wbAll(c)) cat[c] = 4;
			else if (la < -40) cat[c] = 5;
			else if (Math.abs(la) <= 20) cat[c] = 6;
			else cat[c] = 7;
		} else {
			if (la < -60 || box(59, 84, -75, -10)(c)) cat[c] = 8;
			else if (elev[c]! > 1500) cat[c] = 9;
			else if (Math.abs(la) >= 30 && Math.abs(la) < 75) cat[c] = 10;
			else if (Math.abs(la) < 30) cat[c] = 11;
			else cat[c] = 12;
		}
	}
	names.forEach((n, i) => cats.push([n, (c) => cat[c] === i]));
	say('## Partition of squared error (each cell once)');
	tbl(['category', 'area%', 'ann mean (rms)', 'Jan mean (rms)', 'Jul mean (rms)', 'share% ann', 'share% Jan', 'share% all-month'], cats.map(([n, p]) => [
		n, (stat(p, 'ann').area / stat(ALL, 'ann').area * 100).toFixed(1), ...cell3(p), ...share(p),
	]));

	const worst = (key: (c: number) => number, label: string) => {
		const idx = [...Array(N).keys()].sort((a, b) => Math.abs(key(b)) - Math.abs(key(a)));
		say(`## Worst 15 sea cells ${label}`);
		tbl(['lat', 'lon', 'err ann', 'err Jan', 'err Jul'], idx.filter(isSea).slice(0, 15).map((c) => [
			lat[c]!.toFixed(1), lon[c]!.toFixed(1), f(annS[c]! - annO[c]!), f(sim[0]![c]! - obs[0]![c]!), f(sim[6]![c]! - obs[6]![c]!),
		]));
	};
	worst((c) => annS[c]! - annO[c]!, 'annual');
};
