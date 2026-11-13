# Data

The four Earth data files in `public/data/`: what they hold, where they come from, their licences, and how to rebuild them.

| File | What it holds | Size |
|-|-|-|
| `earth-256.bin` | The Earth's elevation on the finest grid | 786,432 bytes |
| `earth-temperature-1deg.bin` | The Earth's observed monthly air temperature | 781,920 bytes |
| `earth-wind-1deg.bin` | The Earth's observed monthly surface winds | 1,563,840 bytes |
| `earth-pressure-1deg.bin` | The Earth's observed monthly sea-level pressure | 781,920 bytes |

Every build downloads its sources into `.cache/`, which is not committed, and reuses them afterwards. Each download is checked against a pinned length and SHA-256 at every run, and a file whose SHA-256 differs is deleted. Every build gives the same bytes every time.

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
