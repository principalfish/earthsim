# Data

The six Earth data files in `public/data/`: what they hold, where they come from, their licences, and how to rebuild them.

| File | What it holds | Size |
|-|-|-|
| `earth-256.bin` | The Earth's elevation on the finest grid | 786,432 bytes |
| `earth-temperature-1deg.bin` | The Earth's observed monthly air temperature | 781,920 bytes |
| `earth-wind-1deg.bin` | The Earth's observed monthly surface winds | 1,563,840 bytes |
| `earth-pressure-1deg.bin` | The Earth's observed monthly sea-level pressure | 781,920 bytes |
| `earth-sea-temperature-1deg.bin` | The Earth's observed monthly sea-surface temperature | 777,600 bytes |
| `earth-currents-1deg.bin` | The Earth's observed monthly surface currents | 1,555,200 bytes |

Every build downloads its sources into `.cache/`, which is not committed, and reuses them afterwards. Each download is checked against a pinned length and SHA-256 at every run, and a file whose SHA-256 differs is deleted. The two ocean builds download files that a server cuts afresh at each request and stamps with the time, so their bytes differ from one download to the next: for those, what is pinned is the SHA-256 of the values the file holds. Every build gives the same bytes every time.

## Elevation

### Format

The mean elevation of each of the 393,216 cells of the finest grid (256 cells per face edge), as whole metres in signed 16-bit integers, little-endian, in cell order, with no header. The two coarser grids are averaged from it, by area, when an Earth world is made.

### Source

NOAA's ETOPO 2022 global relief model.

- **Product:** ETOPO 2022 at 60 arc-seconds, ice surface version, as the GeoTIFF `ETOPO_2022_v1_60s_N90W180_surface.tif` (21,600 × 10,800 pixels of one arc-minute; elevations in metres against the EGM2008 geoid, in effect mean sea level), from <https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/>.
- **Checksum:** 465,969,062 bytes, SHA-256 `9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e`.
- **Ice surface:** the elevations follow the top of the ice sheets, so Greenland and Antarctica stand at the height of their ice. The page has no data on the rock under the ice.
- **Citation:** NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for Environmental Information. https://doi.org/10.25921/fd45-gt74 . Accessed 2026-11-11.
- **Licence,** as stated on NOAA's metadata page for that DOI, read on 2026-11-11: "These data were produced by NOAA and are not subject to copyright protection in the United States. NOAA waives any potential copyright and related rights in these data worldwide through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0-1.0)." The same page says: "Not to be used for navigation."

### Rebuilding

```bash
npm run build:earth
```

- It downloads the GeoTIFF, about 466 MB, into `.cache/etopo/`. A download that was cut off carries on where it stopped.
- Each pixel goes to the cell that holds its centre and counts in that cell's mean by its area.
- The build takes about 40 seconds once the file is there.

### Verification

The script reads the GeoTIFF with its own small reader, not a library. To check that reader against [GDAL](https://gdal.org/):

```bash
npm run build:earth -- --verify-with-gdal
```

This compares about 2,400 pixels with GDAL's `gdallocationinfo` and stops if any differs. Without GDAL installed it says so and carries on.

When the committed file was built, on 2026-11-11 with GDAL 3.12.2:

- those pixels matched bit for bit, as did all 233,280,000 pixels in a separate comparison with the whole image as `gdal_translate` decodes it;
- the cell means were worked out a second time from GDAL's copy of the image with separate code: 392,815 cells matched to the metre, 3 differed by the rounding of a mean that ends in a half, and 398 lie beside cell boundaries that whole columns of pixel centres fall exactly on, where rounding decides which cell a pixel goes to. None of those differed by more than 15 m.

## Observed temperature

Used for the Earth comparison: the mean air temperature 2 m above the ground or the sea for each month, averaged over 1981 to 2010.

### Format

- **Grid:** the source's own, one degree apart: 181 latitudes from 90° N to 90° S and 360 longitudes eastward from 0°. The core interpolates it onto a world's cells when needed.
- **Values:** one unsigned byte `b` standing for `-80 + 0.5 × b` °C, so the file can hold −80 to 47.5 °C in half-degree steps. The source runs from −53.7 to 41.4 °C. Storing a value moves it by at most a quarter of a degree.
- **Order:** month by month, then row by row from the north, then column by column from 0° E, with no header (12 × 181 × 360 bytes).

### Source

NOAA's Twentieth Century Reanalysis.

- **Product:** NOAA/CIRES/DOE 20th Century Reanalysis (V3), the long-term monthly means of 2 m air temperature (variable `air`, in kelvin, the mean of the 80 ensemble members), as the netCDF-3 file `air.2m.mon.ltm.nc` from <https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/2mSI-MO/>. Its rows run from the South Pole to the North Pole; the build turns them over.
- **Checksum:** 4,699,840 bytes, SHA-256 `38ae70640e246a1e90c1a0bca5a7032bdb20a8431a107f30fd1823409b3a57db`.
- **Caveat:** the reanalysis assimilates only surface pressure observations, with the sea surface temperature and sea ice prescribed, so its temperatures over land are less tightly tied to measurements than those of reanalyses that also assimilate temperatures.
- **Licence,** as stated in the dataset's record at NOAA PSL, read on 2026-11-11: "These data were produced by NOAA and are not subject to copyright protection in the United States. NOAA waives any potential copyright and related rights in these data worldwide through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0-1.0)".
- **Acknowledgement,** as NOAA asks: data provided by the NOAA PSL, Boulder, Colorado, USA, from their website at <https://psl.noaa.gov>. For papers NOAA also asks for: "Support for the Twentieth Century Reanalysis Project version 3 dataset is provided by the U.S. Department of Energy, Office of Science Biological and Environmental Research (BER), by the National Oceanic and Atmospheric Administration Climate Program Office, and by the NOAA Earth System Research Laboratory Physical Sciences Laboratory."
- **Reference:** Slivinski, L. C., Compo, G. P., Whitaker, J. S., Sardeshmukh, P. D., et al. (2019), Towards a more reliable historical reanalysis: Improvements for version 3 of the Twentieth Century Reanalysis system. Q J R Meteorol Soc, 145, 2876–2908. https://doi.org/10.1002/qj.3598 .

### Rebuilding

```bash
npm run build:observed-temperature
```

It downloads the source, about 4.7 MB, into `.cache/observed/`, and takes about a second once the file is there. The build stops rather than write a value outside the range the file can hold.

### Verification

The script reads the netCDF file with its own small reader, not a library. To check it against GDAL:

```bash
npm run build:observed-temperature -- --verify-with-gdal
```

This compares about 2,200 points, every month at each, with GDAL's `gdallocationinfo`, both with the file's rows as they are and turned north side up, and stops if any differs.

When the committed file was built, on 2026-11-11 with GDAL 3.12.2, those values matched bit for bit, as did all 781,920 values in a separate comparison with the whole variable as `gdal_translate` decodes it.

## Observed winds and pressure

The mean wind 10 m above the ground or the sea and the mean air pressure reduced to sea level, for each month, averaged over 1981 to 2010. One build writes both files.

### Format

- **Grid:** the same as the observed temperature's: 181 latitudes from 90° N to 90° S and 360 longitudes eastward from 0°. The core interpolates it onto a world's cells when needed: the pressure exactly as the temperature, the wind as a vector, so that a wind blowing across a pole is not cancelled by averaging eastward winds from either side of it.
- **Winds:** two components, eastward and northward, each one signed byte `b` standing for `0.25 × b` m/s, so the file can hold −32 to 31.75 m/s in quarter steps. The source's eastward wind runs from −10.49 to 11.16 m/s and its northward from −10.24 to 13.75 m/s. Storing a value moves it by at most 0.125 m/s.
- **Pressure:** one unsigned byte `b` standing for `940 + 0.5 × b` hPa, so the file can hold 940 to 1,067.5 hPa in half steps. The source runs from 978.42 to 1,036.70 hPa. Storing a value moves it by at most 0.25 hPa.
- **Order of the wind file:** month by month; within a month the whole eastward grid, then the whole northward grid; each grid row by row from the north, then column by column from 0° E; no header (12 × 2 × 181 × 360 bytes).
- **Order of the pressure file:** as the temperature's: month by month, then row by row from the north, then column by column from 0° E, with no header (12 × 181 × 360 bytes).

### Source

NOAA's Twentieth Century Reanalysis, the same dataset as the observed temperature.

- **Product:** NOAA/CIRES/DOE 20th Century Reanalysis (V3), the long-term monthly means of the 10 m wind and of the sea-level pressure (the mean of the 80 ensemble members), as three netCDF-3 files laid out as the temperature's is. Their rows run from the South Pole to the North Pole; the build turns them over.
  - `uwnd.10m.mon.ltm.nc`, the eastward wind (variable `uwnd`, in m/s), from <https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/10mSI-MO/>.
  - `vwnd.10m.mon.ltm.nc`, the northward wind (variable `vwnd`, in m/s), from the same folder.
  - `prmsl.mon.ltm.nc`, the sea-level pressure (variable `prmsl`, in pascals; the build divides by 100 for hectopascals), from <https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/miscSI-MO/>.
- **Checksums:**
  - `uwnd.10m.mon.ltm.nc`: 3,135,968 bytes, SHA-256 `4450426e3ca074f78af0126515d3d14e5245789be68b8d1d21e9f84d694b794d`.
  - `vwnd.10m.mon.ltm.nc`: 3,135,968 bytes, SHA-256 `9a8432467c7c2274cde58144897e699d50d8f92f72c2f162b894d37e9d6002f9`.
  - `prmsl.mon.ltm.nc`: 4,699,888 bytes, SHA-256 `841c8ac2a878899f1d2bed9560dc004c60f59bf0b6542d4ff70da5b95be56c8c`.
- **Caveat:** the reanalysis assimilates only surface pressure observations, so its sea-level pressure is the most closely tied to measurements of its fields; its winds are the model's, shaped by those pressures and by the prescribed sea surface temperature and sea ice.
- **Licence:** the same as the observed temperature's, CC0-1.0, in the words quoted under [Observed temperature](#observed-temperature) from the dataset's record at NOAA PSL, read on 2026-11-11.
- **Acknowledgement and reference:** as for the observed temperature: data provided by the NOAA PSL, Boulder, Colorado, USA, from their website at <https://psl.noaa.gov>, with the support statement and the reference (Slivinski et al., 2019, https://doi.org/10.1002/qj.3598) given there.

### Rebuilding

```bash
npm run build:observed-winds
```

It downloads the three sources, about 11 MB in all, into `.cache/observed/`, and takes about a second once they are there. The build stops rather than write a value outside the range its file can hold, and checks that storing moved no value by more than half a step.

### Verification

The script reads the netCDF files with the project's own small reader. To check it against GDAL:

```bash
npm run build:observed-winds -- --verify-with-gdal
```

This compares the same points as the temperature's build, every month at each, for each of the three variables, with GDAL's `gdallocationinfo`, both with the files' rows as they are and turned north side up, and stops if any differs. Without GDAL installed it says so and carries on.

When the committed files were built, on 2026-11-13 with GDAL 3.12.2, all 26,556 values compared (2,213 points, every month) matched bit for bit for each of `uwnd`, `vwnd` and `prmsl`, in both orders. Two builds gave the same bytes: SHA-256 `4b259f809ca26ba5ca92e72e219f3dd7664a76dd22c5dc94045c6e0d2b5c9711` for `earth-wind-1deg.bin` and `f798ccc777433ba21e7bc351547ba8a3e9d54d8a0885a17ca4cee0628387d61c` for `earth-pressure-1deg.bin`.

## Observed sea-surface temperature

Used for the ocean: the mean temperature of the sea's surface for each month, averaged over 1991 to 2020.

### Format

- **Grid:** one degree apart, but of cell centres, unlike the observed air temperature and winds, whose points lie on whole degrees with a row at each pole: 180 latitudes from 89.5° N to 89.5° S and 360 longitudes eastward from 0.5° to 359.5°, so that each value stands for a cell one degree on a side. Both ocean files use it because both sources are on it, or fall exactly into it: the temperature is on it already, and the currents' quarter-degree cells fall four to a side into its cells, so nothing is interpolated when a file is built. The core interpolates it onto a world's cells when needed, in its own module (`src/core/ocean/observed.ts`), because it cannot share the 181-row sampling.
- **Values:** one unsigned byte `b`. From 0 to 254 it stands for `-2 + 0.25 × b` °C, so the file can hold −2 to 61.5 °C in quarter-degree steps; 255 marks land and places without data, which is never a temperature and never zero. The source's sea runs from −1.79 to 34.00 °C. Storing a value moves it by at most an eighth of a degree. The step is a power of two so that every stored value is held exactly in 32 bits.
- **Land:** 44,219 of the 64,800 cells are sea in every month; the rest are 255. The core marks no data as NaN. When it takes the grid onto a world's cells it interpolates bilinearly, leaving out the points that have no data and scaling the weights of the others to sum to one, so a coast does not pull values towards zero; a cell with no point of data around it is NaN.
- **Order:** month by month, then row by row from the north, then column by column from 0.5° E, with no header (12 × 180 × 360 bytes).

### Source

NOAA's Optimum Interpolation Sea Surface Temperature, version 2.

- **Product:** NOAA Optimum Interpolation (OI) SST V2, the long-term monthly means of 1991 to 2020 of the sea-surface temperature (variable `sst`, 32-bit floats in degrees Celsius, 12 × 180 × 360, rows from 89.5° N and columns from 0.5° E), from the file `sst.ltm.1991-2020.nc` at <https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2/>. That file is netCDF-4, which the project's reader cannot read, so the build uses the netCDF-3 subset of the same file that NOAA PSL's THREDDS server cuts on request: <https://psl.noaa.gov/thredds/ncss/grid/Datasets/noaa.oisst.v2/sst.ltm.1991-2020.nc?var=sst&disableLLSubset=on&disableProjSubset=on&horizStride=1&temporal=all&accept=netcdf3>. Without `temporal=all` the server returns the first month only.
- **Checksums of the original:** 3,441,836 bytes, SHA-256 `16f54e4717a949a8e8ddd143cadfed308a1cc0ea4a2be43c522d899543932b34`.
- **Checksum of the subset:** the subset names the time it was cut in its `History` attribute, so its bytes change with each download (3,115,776 bytes when this was written). What is pinned is its values: the SHA-256 of the 12 × 180 × 360 values of `sst`, each a 32-bit float, little-endian, in the file's order, is `997906a535c027cbeed937939182536639cd5471d8a97199790e41c988a6df37`. The same SHA-256 comes from the original file read with GDAL (`gdal_translate -of ENVI`), so the subset's values are the original's, bit for bit.
- **Land:** the temperature file holds a value in every cell, land included, where the analysis has filled it in (the middle of North America in January is 10 °C). The land-sea mask of the same dataset says which cells are sea: `lsmask.nc` (variable `mask`, 1 for sea and 0 for land, on the same grid), from the same folder, 133,700 bytes, SHA-256 `7f5a9e7459a42c29ec5658e1458f71205034de1a01fc30f8225d5905a8fe2078`. The mask counts the Great Lakes, the Caspian Sea and the like as sea, as the analysis does. The build refuses a sea cell that has no temperature.
- **Licence:** the PSL page of the dataset (<https://psl.noaa.gov/data/gridded/data.noaa.oisst.v2.html>) states no licence, only this request, read on 2026-11-18: "If you acquire data products from PSL, we ask that you acknowledge us in your use of the data. This may be done by including text such as data provided by the NOAA PSL, Boulder, Colorado, USA, from their website at https://psl.noaa.gov in any documents or publications using these data." NOAA's GEO-IDE ERDDAP record of the same product (`sst.mnmean`, a different file of the dataset), read on 2026-11-18, says: "The data may be used and redistributed for free but is not intended for legal use, since it may contain inaccuracies. Neither the data Contributor, ERD, NOAA, nor the United States Government, nor any of their employees or contractors, makes any warranty, express or implied, including warranties of merchantability and fitness for a particular purpose, or assumes any legal liability for the accuracy, completeness, or usefulness, of this information." No CC0 or public-domain dedication was found for this dataset, as there is for the reanalysis's; the data are a product of NOAA's National Centers for Environmental Prediction.
- **Acknowledgement:** data provided by the NOAA PSL, Boulder, Colorado, USA, from their website at <https://psl.noaa.gov>.
- **Reference:** Reynolds, R. W., Rayner, N. A., Smith, T. M., Stokes, D. C., and Wang, W. (2002), An improved in situ and satellite SST analysis for climate. J. Climate, 15, 1609–1625. https://doi.org/10.1175/1520-0442(2002)015<1609:AIISAS>2.0.CO;2 .

### Rebuilding

```bash
npm run build:observed-sea-temperature
```

It downloads the two sources, about 3 MB and 134 kB, into `.cache/observed/`, and takes about a second once they are there. When the server answers that it is busy (429) or fails (5xx), the download waits, at least 10 seconds and twice as long each time, and asks again up to six times. The build stops rather than write a value outside the range the file can hold, and checks that storing moved no value by more than half a step.

### Verification

The script reads the netCDF files with the project's own small reader. To check it against GDAL:

```bash
npm run build:observed-sea-temperature -- --verify-with-gdal
```

This compares about 2,200 points, every month at each, of `sst` and of `mask` with GDAL's `gdallocationinfo`, and stops if any differs. Without GDAL installed it says so and carries on.

When the committed file was built, on 2026-11-18 with GDAL 3.12.2, all 26,520 values of `sst` and all 2,210 of `mask` compared matched bit for bit. Two builds gave the same bytes: SHA-256 `ba63eaf68dc79a4aa9452d1a595d40e66a697ea0565b4e01cf1e6baeaebcb9a4` for `earth-sea-temperature-1deg.bin`.

## Observed surface currents

The mean current at the sea's surface for each month, from the paths of drifting buoys, regridded to one degree.

### Format

- **Grid:** the same as the observed sea-surface temperature's, of cell centres: 180 latitudes from 89.5° N to 89.5° S and 360 longitudes eastward from 0.5° to 359.5°; see that section for why. The core interpolates it onto a world's cells when needed, the current as a vector, so that a current crossing a pole is not cancelled by averaging eastward components from either side of it; the points without data are left out as for the temperature.
- **Currents:** two components, eastward and northward, each one signed byte `b`. From −127 to 127 it stands for `b / 32` m/s, so the file can hold −3.96875 to 3.96875 m/s in steps of 0.03125; −128 marks land and places without data, in both components of the place. The 1° cells' eastward current runs from −1.44 to 2.21 m/s and their northward from −1.61 to 1.27 m/s, across all months; the quarter-degree source's runs from −1.75 to 2.53 and from −1.96 to 2.11 m/s. Storing a value moves it by at most 0.015625 m/s. The step is a power of two so that every stored value is held exactly in 32 bits.
- **Coverage:** the source's quarter-degree cells run from 72.875° S to 84.875° N, and it has no data on land or where no drifter has been. In the file, cells with a current lie only in rows 10 to 162, from 79.5° N to 72.5° S; everything beyond is −128. 32,300 of the 64,800 cells have a current in January. Cells without one are −128, never zero.
- **Order:** month by month; within a month the whole eastward grid, then the whole northward grid; each grid row by row from the north, then column by column from 0.5° E; no header (12 × 2 × 180 × 360 bytes).

### Source

The Global Drifter Program's drifter-derived climatology of near-surface currents.

- **Product:** "Global Drifter Program - Climatology - Monthly Means", version 3.10, monthly means of the eastward (`U`) and northward (`V`) velocity in metres a second on a grid a quarter of a degree apart: 12 months × 1,440 longitudes (−179.875° to 179.875°) × 632 latitudes (−72.875° to 84.875°), laid out month, longitude, latitude, with NaN where there is no data. "Climatology uses data through 28-Feb-2023"; the file was created 21-Aug-2023. It is the dataset of the paper below, served by the Global Drifter Program's ERDDAP at <https://erddap.aoml.noaa.gov/gdp/erddap/griddap/drifter_monthlymeans>. AOML's page for the climatology (<https://www.aoml.noaa.gov/phod/gdp/mean_velocity.php>) could not be fetched when this was written: its server refused the TLS handshake from the build machine, so the licence text below is from the ERDDAP dataset's metadata, and the page, which lists a later version, 3.11, was not read.
- **Files:** the build asks ERDDAP for netCDF-3 subsets, one request for each component, each with every month, longitude and latitude: `https://erddap.aoml.noaa.gov/gdp/erddap/griddap/drifter_monthlymeans.nc?U[0:1:11][0:1:1439][0:1:631]` and the same with `V`. The whole-file download on the server is netCDF-4, which the project's reader cannot read.
- **Checksum:** the subsets name the time they were made in their `history` attribute, so their bytes change with each download (87,388,416 and 87,388,420 bytes when this was written). What is pinned is their values: the SHA-256 of the 12 × 1,440 × 632 values of `U` followed by those of `V`, each a 32-bit float, little-endian, in the files' order, with every NaN as the same bits, is `375e2cdc218b33af5a14512b89a5a0bc9f54ec44302216f411408a94f61c0adb`. The build stops, and deletes the files, if it is not.
- **Licence,** as stated in the ERDDAP dataset's metadata, read on 2026-11-18: "Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/) This study used data collected and made freely available by the NOAA Global Drifter Program (https://www.aoml.noaa.gov/phod/gdp/) accessed from https://erddap.aoml.noaa.gov/gdp/erddap/index.html". CC BY 4.0 allows sharing and adapting the data, including commercially, if the credit below is given, a link to the licence is given, and changes are indicated.
- **Attribution:** Laurindo, L., Mariano, A., and Lumpkin, R. (2017), An improved near-surface velocity climatology for the global ocean from drifter observations. Deep-Sea Research Part I, 124, 73–92. https://doi.org/10.1016/j.dsr.2017.04.009 . Data collected and made freely available by the NOAA Global Drifter Program, NOAA/AOML and the University of Miami, version 3.10, accessed 2026-11-18 from <https://erddap.aoml.noaa.gov/gdp/erddap/index.html>, licence CC BY 4.0 (<https://creativecommons.org/licenses/by/4.0/>). **Changes:** the monthly mean currents were regridded to 1° by averaging, and stored in steps of 1/32 m/s.
- **Regridding:** each one-degree cell is the mean of the sixteen quarter-degree cells inside it, east and north components separately, counting only the cells that have both components: a cell on a coast or with a gap is the mean of the sea around it, and a cell with none has no data. The quarter-degree cells fall exactly four to a side into the one-degree cells, with the longitudes taken from 0° east (western longitudes wrap to 180° to 360° E, so the fine cells either side of 180° fall in the one-degree cells centred on 179.5° and 180.5° E). The quarter-degree rows run from 73° S to 85° N, so the rows of one-degree cells beyond them have no data. The averaging is in `scripts/earth/regrid.ts`.

### Rebuilding

```bash
npm run build:observed-currents
```

It downloads the two sources, about 175 MB in all, into `.cache/observed/`, and takes about three seconds once they are there. When the server answers that it is busy (429) or fails (5xx), the download waits as the sea temperature's does. The build stops rather than write a value outside the range the file can hold, and checks that storing moved no value by more than half a step. It has no `--verify-with-gdal`: GDAL would read the sources' longitude as rows, and the sources' values are checked by their SHA-256 instead.

### Verification

When the committed file was built, on 2026-11-18, the one-degree cell centred on 35.5° N, 285.5° E (off Cape Hatteras) for January was checked against the sixteen quarter-degree values ERDDAP's own CSV gives for it, averaged separately: 0.740 m/s eastward and 0.746 northward, stored as 0.75 and 0.75. Two builds gave the same bytes: SHA-256 `544bd6a562943bccc2d6d4fcb2a54b2801e139d5c02c44492f549c0a58fae2e7` for `earth-currents-1deg.bin`.
