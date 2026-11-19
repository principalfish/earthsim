# Resume: ocean-currents-carrying-heat-into-the-climate-loop

_2026-11-19_ · piece 5 of 9 built in the builder's worktree, not reviewed or committed (branch HEAD is piece 4, `8e019fd`).

**Waiting on the user:** piece 5 stopped on its stop rule. With currents carrying the sea's heat (full 200 m transport), the Earth gets clearly worse in places: sea rms against OISST 2.40 → 3.15 K, global air rms 3.73 → 4.12; Antarctica, the North Pacific, the Kuroshio extension, the Southern Ocean and the Arctic are worse, and the Europe–Asia contrast falls (2.8 → 0.9 annual). The North Atlantic, the Norwegian Sea, Scandinavia, western Europe and the upwelling coasts are better. It is also slower: from nothing 13.5 s at 64 (was 8.9) and 55.6 s at 256 (was 29.5).

The likely cause: the sea's `diffusivity` (0.55, `src/core/config.ts:200`) is documented as standing in for "all the heat the winds and currents carry", so poleward heat is now counted twice. Builder's options: (a) accept as is; (b) carry only 60 m; (c) measure a lower sea diffusivity first (outside the plan), plus look for speed in the sea step.

**Next:** relay the user's answer to the builder (session `local_eb13cb33-7cf1-48ce-a63f-84119c45555c`), quoting them.
