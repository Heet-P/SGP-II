# Solar Society Lead Platform - Prototype Dataset Pack

Generated: 2026-08-17
Solar farm test configuration: 5.0 MW, Pune-area reference point (18.5204, 73.8567).

## What this pack is
This is an end-to-end, source-aware prototype dataset designed to let you build and test the provider-agnostic solar-society lead platform without pretending that unavailable commercial/energy fields are real.

## Files
1. `01_source_registry.csv` - source inventory, URLs, roles, trust level and limitations.
2. `02_maharera_projects_real_sample.csv` - 30 real project records extracted from public MahaRERA search result pages. These contain only fields visibly supported by those pages.
3. `03_society_building_context.csv` - building/location enrichment in a Google Open Buildings-compatible shape, but the values are synthetic proxies. Do NOT call these Google observations.
4. `04_society_energy_monthly_synthetic.csv` - 24 months of synthetic society-level consumption. Profile is calibrated conceptually to Indian residential load behavior; it is NOT SEIL-R raw data.
5. `05_society_features_ranked.csv` - canonical feature table plus transparent baseline ranking for the sample 5 MW farm.
6. `06_outreach_outcomes_synthetic.csv` - synthetic CRM history for training/testing the ML pipeline.

## Why synthetic fields are present
The public SEIL-R dataset is real and public, covering electricity consumption of residences in a Mumbai multi-storey building at 5 Hz over one year. The public source is linked in `01_source_registry.csv`. The raw source was not embedded here, so synthetic society aggregates are provided for pipeline development.

Google Open Buildings V3 is also public, but its raw polygon/point dataset is enormous. Google states that rows contain latitude, longitude, area, confidence, geometry and plus code; the dataset does not identify building type or street address. The building context file therefore uses the same conceptual fields but explicitly marks its local values as synthetic/estimated.

## Critical modeling rule
Never train or report a production conversion model using `*_synthetic` target/feature values as if they were real outcomes. Use the synthetic tables only to validate the pipeline, feature engineering, ranking interface, model plumbing and allocation algorithms.

## Real-to-synthetic lineage
MahaRERA -> real society/project identity
SEIL-R -> real residential load source and calibration reference
Google Open Buildings -> real geometry schema and enrichment option
Microsoft GlobalMLBuildingFootprints -> alternate geometry/height enrichment option
Maharashtra Cooperation Department -> aggregate society market-size validation
Energy values -> synthetic until client/distribution utility data is available
Conversion outcomes -> synthetic until real CRM feedback exists

## Recommended next replacement steps
1. Replace `02_maharera_projects_real_sample.csv` with a scheduled MahaRERA connector/export for the geographic scope of interest.
2. Replace `03_society_building_context.csv` with actual Google Open Buildings or Microsoft building footprints for the target radius.
3. Replace `04_society_energy_monthly_synthetic.csv` with licensed/client electricity data. Preserve the canonical column names.
4. Start capturing actual outreach events using the same schema as `06_outreach_outcomes_synthetic.csv`.
5. Retrain the conversion model only after real labels accumulate.

## Known data issues intentionally preserved
- MahaRERA public search records are project-centric, not guaranteed to be legally identical to a cooperative housing society.
- Project names can include commercial properties. `residential_eligible` is therefore an explicit downstream field.
- Public portal locality/district fields are not a substitute for precise coordinates. Prototype coordinates are district/locality centroid estimates.
- Electricity consumption is the key missing real-world field in this public prototype and is synthetic.
- Decision-maker contact fields are deliberately omitted from this pack. Production outreach should use lawful, purpose-limited sources and provenance.
- Building footprints do not inherently identify which footprints belong to a specific society. Entity resolution is a separate step.

## Ranking baseline
The prototype priority score combines synthetic conversion likelihood, distance, capacity fit and commercial savings. It is intentionally transparent so you can compare ML performance against it later.

## Source URLs
MahaRERA: https://www.maharera.maharashtra.gov.in/
SEIL-R: https://figshare.com/collections/SEIL-R_dataset/5144315/1
Google Open Buildings: https://sites.research.google/gr/open-buildings/
Microsoft GlobalMLBuildingFootprints: https://github.com/microsoft/GlobalMLBuildingFootprints
Maharashtra Cooperation Department: https://sahakarayukta.maharashtra.gov.in/Site/Statistic/PrimaryCooperativeHousingSocieties.aspx
