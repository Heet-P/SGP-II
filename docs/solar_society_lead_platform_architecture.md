# Solar Society Lead Prioritization Platform

## Project Architecture, Data Strategy, Dataset Recommendations, and Implementation Plan

**Prepared:** 13 August 2026  
**Purpose:** Design a reusable, modular platform that can ingest heterogeneous society/property/energy datasets from many providers, normalize them into a common internal representation, and produce ranked solar-farm outreach leads plus capacity-fit recommendations.

---

## 1. Executive Summary

The proposed platform should not be designed around one dataset, one provider, or one fixed schema.

The central architectural decision is:

> **External data is variable. The internal business representation should be stable.**

Different providers may provide different combinations of:

- Society/project name
- Address
- Pincode
- Latitude/longitude
- Number of residential units
- Buildings/wings/floors
- Built-up or carpet area
- Electricity consumption
- Peak demand
- Tariff/current electricity cost
- Developer/promoter information
- Contact information
- Project status
- Historical energy data

The platform should therefore use a **source-adapter architecture**. Each provider gets a small connector/adapter whose only responsibility is to translate the provider's format into a common canonical data model.

Once data enters the canonical model, the rest of the system should be provider-agnostic.

```text
External Providers
       |
       v
Source Adapters / Connectors
       |
       v
Canonical Data Model
       |
       +--> Data Quality & Entity Resolution
       |
       +--> Geographic / External Enrichment
       |
       +--> Feature Generation
       |
       v
Decision Engine
       |
       +--> Lead Prioritization
       +--> Capacity Allocation
       +--> Explainable Recommendations
       |
       v
Dashboard / API / CSV
       |
       v
Outreach Outcomes
       |
       v
Historical Feedback Dataset
       |
       v
ML Ranking / Conversion Prediction
```

The supplied project proposal already separates the problem into a **Prioritized Outreach List** and an **Optimal Allocation List**, with Phase 1 using rule-based/optimization logic and Phase 2 refining prioritization using actual pitch outcomes. This document extends that concept into a provider-independent platform architecture. 

---

## 2. The Actual Business Problem

Given a solar farm with:

- Location
- Available electricity capacity
- Selling price or expected offered tariff
- Operating constraints
- Applicable distance or service radius

identify residential societies that are commercially attractive prospects.

The platform should answer two different questions.

### Question A: Who should sales approach first?

This is a **lead prioritization** problem.

Example output:

| Rank | Society | Distance | Consumption | Estimated Savings | Conversion Likelihood | Priority |
|---:|---|---:|---:|---:|---:|---|
| 1 | Green Valley Residency | 4.8 km | 1.20 MW | High | 91% | Very High |
| 2 | Sunrise Heights | 7.1 km | 0.90 MW | High | 86% | Very High |
| 3 | Lakeview Towers | 11.2 km | 1.60 MW | Medium | 72% | High |

### Question B: Which combination best uses the farm's capacity?

This is a **capacity allocation / constrained optimization** problem.

Example:

```text
Farm available capacity: 5.0 MW

Green Valley Residency   1.20 MW
Sunrise Heights           0.90 MW
Lakeview Towers           1.60 MW
Skyline Enclave           0.80 MW
Riverfront Residency      0.45 MW
----------------------------------
Total                     4.95 MW
```

A society can therefore be an attractive lead individually but still be a poor member of the best overall portfolio for a particular farm.

These should remain separate outputs.

---

# 3. Core Architectural Principle: Canonical Data Model

Do **not** make the internal database look like the first provider's CSV.

Instead, design the database around the business domain.

## 3.1 Canonical society model

```text
Society
├── identity
│   ├── society_id
│   ├── canonical_name
│   ├── aliases
│   ├── registration_id
│   └── entity_type
│
├── location
│   ├── full_address
│   ├── locality
│   ├── city
│   ├── district
│   ├── state
│   ├── country
│   ├── pincode
│   ├── latitude
│   └── longitude
│
├── property
│   ├── number_of_units
│   ├── number_of_buildings
│   ├── number_of_wings
│   ├── number_of_floors
│   ├── built_up_area_m2
│   ├── carpet_area_m2
│   ├── property_type
│   └── project_status
│
├── energy
│   ├── annual_consumption_kwh
│   ├── monthly_consumption_kwh
│   ├── peak_demand_kw
│   ├── current_tariff
│   ├── current_provider
│   └── load_profile
│
├── contact
│   ├── decision_maker_name
│   ├── role
│   ├── phone
│   ├── email
│   └── contact_source
│
├── commercial
│   ├── estimated_savings
│   ├── estimated_contract_value
│   ├── estimated_energy_requirement
│   └── farm_capacity_fit
│
└── provenance
    ├── source_system
    ├── source_record_id
    ├── source_url
    ├── observed_at
    ├── ingested_at
    ├── freshness
    └── quality_status
```

Not every society will have every field. **Missing data is expected.** The system must be designed to operate with partial information rather than rejecting everything that does not perfectly match the schema.

---

# 4. Provider-Agnostic Data Architecture

## 4.1 Source adapters

Each provider gets an adapter.

```text
providers/
│
├── csv/
│   └── generic_csv_adapter
│
├── excel/
│   └── generic_excel_adapter
│
├── maharera/
│   └── maharera_adapter
│
├── utility/
│   └── utility_consumption_adapter
│
├── api/
│   └── generic_rest_adapter
│
└── geospatial/
    ├── google_open_buildings_adapter
    └── microsoft_building_footprints_adapter
```

Each adapter should produce the same normalized object.

### Example

Provider A:

```csv
project_name,address,total_units,monthly_kwh
Green Valley, Pune, 420, 152000
```

Provider B:

```text
name = Green Valley Residency
location = Pune, Maharashtra
units = 420
Jan_2026 = 148000
Feb_2026 = 152000
Mar_2026 = 161000
```

Provider C:

```json
{
  "project": "GVR",
  "lat": 18.52,
  "lng": 73.85,
  "residential_units": 420
}
```

All three should end up as something conceptually equivalent to:

```json
{
  "canonical_name": "Green Valley Residency",
  "location": {
    "city": "Pune",
    "latitude": 18.52,
    "longitude": 73.85
  },
  "number_of_units": 420,
  "monthly_consumption_kwh": 152000,
  "provenance": {
    "source_system": "provider_b",
    "source_record_id": "..."
  }
}
```

The downstream ranking engine should not care which provider generated it.

---

# 5. Data Quality Layer

A source-independent system needs a dedicated quality layer.

Every important field should have:

- Value
- Source
- Timestamp
- Quality/status
- Optional confidence/verification metadata

Example:

```json
{
  "annual_consumption_kwh": {
    "value": 1840000,
    "source": "client_utility_export",
    "observed_at": "2026-07-31",
    "quality": "verified"
  }
}
```

While another society may have:

```json
{
  "annual_consumption_kwh": {
    "value": 1690000,
    "source": "estimated_from_units_and_area",
    "observed_at": "2026-08-13",
    "quality": "estimated"
  }
}
```

The platform must distinguish **observed data** from **estimated data**.

## Recommended quality statuses

```text
verified
source_reported
estimated
inferred
stale
conflicting
missing
invalid
```

---

# 6. Entity Resolution and Deduplication

This becomes critical when combining multiple sources.

The same society may appear as:

```text
Sunrise Heights
Sunrise Heights Society
Sunrise Heights Co-op Hsg Soc Ltd
Sunrise Hts
SUNRISE HEIGHTS
```

The platform should create one canonical entity and maintain source mappings.

```text
canonical_society_id: SOC_004829

source mappings:
├── maharera: P52100012345
├── provider_a: 881922
├── provider_b: MH-PUN-8272
└── geospatial: cluster_821991
```

Recommended matching signals:

1. Registration/project ID where available
2. Normalized name
3. Address similarity
4. Pincode
5. Latitude/longitude proximity
6. Developer/promoter information
7. Unit count / building information

Do not rely on name matching alone.

---

# 7. Data Enrichment Layer

The source data will rarely contain everything needed by the ranking engine.

Therefore, the platform should support enrichment providers.

Possible enrichment types:

```text
Society
  |
  +--> Geocoding
  +--> Distance to farm
  +--> Building footprint
  +--> Estimated building area
  +--> Nearby infrastructure
  +--> Energy estimate
  +--> Property characteristics
  +--> Tariff information
```

This is where public geospatial datasets become particularly useful.

---

# 8. Recommended External Datasets and Data Sources

## 8.1 MahaRERA

**Priority: Very High**

Official Maharashtra Real Estate Regulatory Authority data is one of the best starting points for building the society/project universe in Maharashtra.

The official portal supports searching registered projects using fields including project name/registration number, pincode and completion date, and also provides project-map functionality. Current search pages expose project name, promoter, locality, state, pincode and district for registered projects. [MahaRERA](https://www.maharera.maharashtra.gov.in/) 

Useful fields for the project can include:

- Project name
- MahaRERA registration number
- Promoter
- Location/locality
- Pincode
- District
- Project status
- Completion information
- Project documents/details where publicly available

**Recommended usage:** Build the initial Maharashtra project/society universe from this source.

**Caveat:** MahaRERA is a real-estate/project registry, not an electricity-consumption database. Do not assume project data directly gives electricity consumption.

---

## 8.2 SEIL-R: Mumbai Residential Electricity Dataset

**Priority: High for energy-model prototyping**

IEEE's public SEIL-R dataset contains electricity consumption from residences of a multi-storey building in Mumbai. It provides real-world consumption data at 5 Hz over one year. [IEEE PES Data Sharing](https://ieee-pes-data-sharing.org/datasets/detail/1a8a72fb-bc65-4990-8003-ed42d9c7c2c8)

Useful for:

- Load-profile analysis
- Seasonality
- Consumption aggregation
- Peak-demand features
- Energy feature engineering
- Testing consumption estimation methods

**Limitation:** It is not a Maharashtra-wide society lead list and does not provide the commercial/contact information needed for lead generation.

**Recommended usage:** Use it to validate the energy-processing/feature-engineering side of the platform while the actual client data source is unavailable.

---

## 8.3 Google Open Buildings

**Priority: High for geographic enrichment**

Google Open Buildings is a large open building-footprint dataset focused on the Global South. The current dataset contains roughly 1.8 billion building detections over a large geographic inference area and includes building polygons, centroid latitude/longitude, area, confidence information and Plus Codes. [Google Research](https://sites.research.google/gr/open-buildings/)

Useful for:

- Building density
- Building footprint area
- Geographic clustering
- Spatial enrichment
- Supporting building-count/area estimates
- Identifying built-up areas around a farm

The dataset is large, so the platform should download/process only the geographic cells required for the target farm rather than ingesting the full global dataset.

---

## 8.4 Microsoft GlobalMLBuildingFootprints

**Priority: Medium/High for geospatial enrichment**

Microsoft's GlobalMLBuildingFootprints project provides worldwide building footprints derived from satellite imagery. The project states that approximately 1.4 billion buildings have been detected, with data available under the CDLA Permissive 2.0 license. The project also maintains regional download links. [Microsoft GlobalMLBuildingFootprints](https://github.com/microsoft/GlobalMLBuildingFootprints)

An important reason to keep this as a supported adapter is that the platform should be able to swap geospatial sources without changing downstream business logic.

Useful for:

- Building footprint geometry
- Building density
- Approximate built-up area
- Geographic enrichment

**Important:** Building datasets vary in quality by geography. Treat them as enrichment data, not authoritative society records.

---

## 8.5 Maharashtra Cooperative Housing Society Statistics

**Priority: Medium for market sizing and validation**

The Maharashtra Cooperation Department publishes statistics for primary co-operative housing societies and district/type-wise cooperative society information. [Maharashtra Cooperation Department](https://sahakarayukta.maharashtra.gov.in/Site/Statistic/PrimaryCooperativeHousingSocieties.aspx)

This can help validate assumptions such as:

- Scale of the housing-society market
- Regional concentration
- District-level market sizing

**Limitation:** The public statistics pages should not be treated as a clean, society-level lead database.

---

## 8.6 Commercial / Paid Society Lead Datasets

Commercial datasets can be considered for experimentation where legally licensed for the intended use.

One example found during research is a commercial Maharashtra cooperative-society dataset provider advertising society names and contact-related fields. Treat such providers as **potential sources requiring licensing and quality verification**, not automatically trusted data.

Before purchasing, verify:

- Field-level coverage
- Source of phone/email data
- Last-updated date
- Duplicate rate
- Geographic coverage
- Commercial-use rights
- Redistribution restrictions
- Consent/legal basis for personal data
- Refund/data-quality terms

**Recommendation:** Do not make a paid provider a hard dependency. Implement it as another adapter.

---

# 9. The Most Important Data Gap

The hardest dataset to find publicly is the one you ultimately need for genuine conversion prediction:

```text
Society
+ electricity consumption
+ decision maker
+ outreach attempt
+ outcome
+ reason for rejection
+ conversion
```

A public dataset containing all of these fields for Indian housing societies is unlikely to be available at useful quality.

Therefore, the platform should be designed to **create its own feedback dataset**.

Example:

```text
society_id
contact_date
contacted
contact_channel
meeting_booked
proposal_sent
negotiation_started
converted
rejection_reason
contract_value
conversion_date
```

This dataset eventually becomes the foundation for the ML phase.

---

# 10. Phase 1 vs Phase 2

## Phase 1: Data + Rules + Optimization

The first production-capable version should **not pretend to predict conversion**.

It should produce a transparent priority score based on business rules and measurable characteristics.

Possible initial factors:

- Distance from solar farm
- Annual electricity consumption
- Peak demand
- Estimated savings
- Size of society
- Capacity compatibility
- Estimated contract value
- Data quality
- Project status
- Client-defined commercial rules

The proposal already recommends starting with configurable rules such as consumption/capacity matching, proximity and estimated cost savings, then refining the criteria with the client. 

### Phase 1 outputs

1. Prioritized Outreach List
2. Optimal Capacity Allocation List
3. Data-quality indicators
4. Explanation of why each society received its rank
5. Export to CSV/Excel
6. Dashboard

---

## Phase 2: Conversion Prediction / Ranking Model

Once real outreach outcomes accumulate:

```text
Historical Society Data
        +
Outreach History
        +
Conversion Outcomes
        |
        v
Training Dataset
        |
        v
ML Ranking / Classification
        |
        +--> Conversion Probability
        +--> Expected Value
        +--> Ranking
```

The model should learn from actual business outcomes instead of from an artificially labelled dataset.

The original proposal also calls for this feedback-driven approach and retaining Phase 1 as a baseline/fallback. 

---

# 11. Do Not Mix These Three Scores

A major recommendation is to keep these concepts separate.

## 11.1 Conversion likelihood

> How likely is this society to convert?

Example:

```text
Society A: 91%
Society B: 84%
Society C: 62%
```

## 11.2 Commercial value

> How valuable would the society be if converted?

Possible drivers:

- Electricity volume
- Margin
- Contract duration
- Expected savings
- Farm capacity utilization

## 11.3 Approach priority

> Who should the sales team actually contact first?

Conceptually:

```text
Approach Priority
    =
Conversion Likelihood
    × Commercial Value
    × Capacity Fit
    × Business Rules
```

The exact formula should remain configurable.

This prevents a common failure mode where a tiny society ranks above a much more valuable opportunity merely because it has a high predicted conversion probability.

---

# 12. Capacity Allocation Engine

Suppose:

```text
Farm capacity = 5 MW
```

Candidate societies:

```text
A = 1.8 MW
B = 1.4 MW
C = 0.9 MW
D = 0.8 MW
E = 0.7 MW
F = 0.5 MW
G = 0.3 MW
```

The platform should evaluate combinations rather than simply taking the first N ranked societies.

Objective could be something like:

```text
Maximize:
    expected commercial value
    + conversion probability
    + capacity utilization

Subject to:
    total allocated demand <= available farm capacity
```

Additional constraints can later be added:

- Minimum viable society size
- Maximum service distance
- Minimum margin
- Maximum number of societies
- Contract constraints
- Diversity/portfolio constraints
- Regulatory constraints

This is a separate optimization module so that replacing the ranking engine does not require rewriting the capacity allocator.

---

# 13. Recommended Database Structure

A relational database such as PostgreSQL is a strong fit because the core entities are structured and relational, while geospatial fields can be handled with PostGIS if needed.

Suggested tables:

```text
providers
source_records
societies
society_aliases
society_locations
society_properties
society_energy
society_contacts
society_features
farms
farm_capacity_snapshots
ranking_runs
ranking_results
allocation_runs
allocation_results
outreach_events
conversion_outcomes
feature_definitions
ranking_rules
```

## Critical design principle

Keep **raw source data** separately from **normalized data**.

```text
raw provider data
        |
        v
normalized canonical data
        |
        v
derived features
        |
        v
ranking results
```

Never overwrite raw source records with cleaned values.

This gives you traceability and makes debugging dramatically easier.

---

# 14. Recommended Data Pipeline

```text
1. INGEST
   |
   v
2. RAW STORAGE
   |
   v
3. SCHEMA VALIDATION
   |
   v
4. NORMALIZATION
   |
   v
5. ENTITY RESOLUTION
   |
   v
6. DATA QUALITY
   |
   v
7. ENRICHMENT
   |
   v
8. FEATURE GENERATION
   |
   v
9. RANKING
   |
   v
10. CAPACITY OPTIMIZATION
   |
   v
11. OUTPUT
   |
   +--> Dashboard
   +--> CSV/Excel
   +--> API
```

Each stage should be independently testable.

---

# 15. Adapter Contract

Every adapter should implement approximately the same interface.

```python
class DataProviderAdapter:
    def fetch(self):
        """Retrieve source data."""
        pass

    def validate(self, data):
        """Validate source-specific structure."""
        pass

    def normalize(self, data):
        """Convert source data into canonical entities."""
        pass

    def get_provenance(self):
        """Return provider and source metadata."""
        pass
```

A real implementation could instead use a typed schema such as Pydantic models and provider-specific mapping configurations.

The important idea is that the ranking service receives canonical data only.

---

# 16. Feature Store / Feature Layer

The ranking engine should consume reusable features rather than repeatedly performing raw calculations.

Examples:

```text
DistanceToFarmKm
AnnualConsumptionKWh
PeakDemandKW
EstimatedSavingsPerMonth
EstimatedContractValue
CapacityFitRatio
NumberOfUnits
BuildingAreaM2
SocietyAge
DataFreshnessDays
EnergyDataQuality
```

These features can then feed:

- Rule-based ranking
- ML ranking
- Reporting
- Analytics
- Capacity optimization

This is another important decoupling layer.

---

# 17. Explainability

For a sales-facing system, showing only a rank is not enough.

The dashboard should be able to answer:

> **Why is this society ranked #3?**

Example:

```text
Rank #3: Lakeview Towers

Why it ranks highly:
+ High electricity consumption
+ 11 km from farm
+ Strong estimated monthly savings
+ Good capacity fit
+ Similar societies have converted well

Potential concern:
- Energy data is 11 months old
```

For ML output, expose reason codes / feature contributions rather than raw technical model terminology to the non-technical user.

---

# 18. Dashboard Recommendation

The platform should be designed for business users rather than data scientists.

## Screen 1: Create Campaign

```text
Solar Farm
[ Select Farm ]

Available Capacity
[ 5.0 MW ]

Maximum Distance
[ 50 km ]

Minimum Society Size
[ 100 units ]

[ Generate Lead List ]
```

## Screen 2: Prioritized Leads

Columns:

- Rank
- Society
- Location
- Approx. consumption
- Distance
- Estimated savings
- Opportunity value
- Conversion likelihood, once available
- Recommended action

## Screen 3: Capacity Allocation

Show:

- Available capacity
- Recommended society combination
- Allocated capacity
- Unused capacity
- Expected commercial value

## Screen 4: Society Detail

Show:

- Property information
- Energy information
- Contact information, subject to permissions
- Data sources
- Data freshness
- Ranking explanation
- Outreach history

## Screen 5: Outreach Feedback

Sales user records:

```text
Contacted
Meeting
Proposal
Negotiation
Converted
Rejected
Reason
Notes
```

This screen directly creates the future ML training data.

---

# 19. Recommended Technology Stack

A practical student/project stack:

### Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy

### Data processing

- Pandas for smaller datasets
- Polars for larger tabular processing where useful
- GeoPandas for geospatial processing
- Shapely

### Database

- PostgreSQL
- PostGIS if geographic queries are important

### ML

Phase 1:

- Rule engine
- Scoring functions
- Optimization library

Phase 2:

- scikit-learn baseline
- Gradient boosting / ranking models depending on data volume
- Proper time-based validation

### Optimization

Potentially:

- OR-Tools
- PuLP

Start simple rather than introducing a complex optimization framework before the business objective is stable.

### Frontend

A web application is preferable for the final product.

Possible stack:

- Next.js
- TypeScript
- Tailwind CSS
- Map-based visualization

A lightweight Streamlit version is acceptable for Phase 1, and the original proposal explicitly suggests Streamlit as the initial interface. 

### Infrastructure

For a student deployment:

- PostgreSQL/PostGIS
- Object storage for raw datasets
- Scheduled workers
- FastAPI service
- Next.js frontend

Keep infrastructure replaceable.

---

# 20. Recommended Project Repository

```text
solar-lead-platform/
│
├── apps/
│   ├── api/
│   └── web/
│
├── packages/
│   ├── schemas/
│   ├── ranking/
│   ├── optimization/
│   ├── geo/
│   └── data-quality/
│
├── providers/
│   ├── maharera/
│   ├── seilr/
│   ├── google_open_buildings/
│   ├── microsoft_buildings/
│   ├── csv/
│   └── client_sources/
│
├── pipelines/
│   ├── ingestion/
│   ├── normalization/
│   ├── entity_resolution/
│   ├── enrichment/
│   └── features/
│
├── ml/
│   ├── datasets/
│   ├── training/
│   ├── evaluation/
│   └── inference/
│
├── optimization/
│
├── migrations/
├── tests/
├── docs/
└── configs/
```

The exact stack can change, but the modular boundaries should remain.

---

# 21. Data Versioning and Reproducibility

Every ranking run should be reproducible.

Store:

```text
ranking_run_id
farm_id
farm_capacity
rules_version
feature_version
data_snapshot_id
model_version
created_at
```

If a society was #4 last month and #28 this month, the system should be able to explain why.

Potential reasons:

- Consumption changed
- A source was updated
- Distance/farm configuration changed
- Business rule changed
- Model version changed
- Data became stale

---

# 22. Security and Privacy

The project involves potentially sensitive personal/contact information.

The supplied proposal correctly highlights the need to use personal information only for the intended project purpose, restrict access, secure storage, and consider India's Digital Personal Data Protection Act, 2023. 

Recommended architecture:

```text
Public/low-risk data
        |
        v
General society database

Sensitive contact data
        |
        v
Restricted tables / access policy
```

Do not expose contact details in exports by default.

Recommended controls:

- Role-based access
- Audit logging
- Encryption in transit
- Encryption at rest where supported
- Restricted contact-data access
- Source licensing records
- Data retention rules
- Delete/update workflow

Do not scrape or purchase personal contact data without checking the source's terms and the legal basis for the intended processing.

---

# 23. Important Recommendation: Do Not Over-Promise AI

The biggest project risk is trying to call everything AI.

A better narrative is:

### Stage 1

**Data engineering + decision support**

### Stage 2

**Learning from real sales outcomes**

### Stage 3

**Advanced predictive intelligence**

This gives you a much stronger technical story because every stage has a measurable reason to exist.

---

# 24. Recommended MVP

Do not start with all of Maharashtra and 10 data providers.

Start with:

```text
1 solar farm
1 geographic region
1 society/project source
1 energy dataset
1 geospatial enrichment source
100-1,000 societies
```

Build the entire pipeline end-to-end.

Then add a second provider.

### MVP success test

```text
Provider A
    |
    v
Canonical schema
    |
    v
Ranking
    |
    v
Dashboard
```

Then:

```text
Provider B
    |
    v
Same canonical schema
    |
    v
Same ranking engine
    |
    v
Same dashboard
```

If adding Provider B requires rewriting the ranking engine, the abstraction is wrong.

This should be a central architecture test.

---

# 25. Dataset Strategy I Recommend

Instead of trying to find one perfect dataset, create a composite dataset.

## Base society universe

**MahaRERA**

Provides the project/property universe and identifiers.

## Geographic enrichment

**Google Open Buildings** or **Microsoft GlobalMLBuildingFootprints**

Provides building geometry and spatial characteristics.

## Energy prototyping

**SEIL-R**

Provides real Indian residential consumption data for testing the energy-processing pipeline.

## Market validation

**Maharashtra Cooperation Department statistics**

Provides aggregate context for housing/cooperative society scale.

## Commercial contact data

Client-provided data or a properly licensed provider.

## Conversion labels

Collected directly through the platform's outreach workflow.

---

# 26. What I Would NOT Do

## Do not hard-code provider columns

Bad:

```python
row["monthly_kwh"]
```

throughout the entire application.

Instead, provider-specific mapping belongs inside the adapter.

## Do not make missing fields fatal

A dataset without electricity consumption should still be ingestible.

It may simply receive a lower data-quality rating or wait for enrichment.

## Do not train an ML model on fabricated conversion labels and present them as real predictive accuracy

Synthetic data is fine for demonstrating the pipeline, but clearly label it as synthetic.

## Do not combine heterogeneous measurements silently

For example, do not treat:

```text
monthly electricity consumption
```

and

```text
annual electricity consumption estimate
```

as equivalent without explicit normalization.

## Do not hide uncertainty

A ranking based on estimated consumption is fundamentally different from a ranking based on verified meter data.

---

# 27. Recommended Development Roadmap

## Milestone 1: Domain and schema

- Define canonical society model
- Define farm model
- Define energy model
- Define provenance model
- Define outreach/conversion model

## Milestone 2: First provider

- Ingest one real source
- Store raw data
- Normalize data
- Validate records
- Build deduplication

## Milestone 3: Second provider

- Implement a completely different source format
- Normalize into the same model
- Prove existing ranking code still works unchanged

## Milestone 4: Geospatial enrichment

- Geocode societies
- Store coordinates
- Calculate farm-to-society distance
- Integrate a building-footprint source

## Milestone 5: Phase 1 ranking

- Configurable scoring rules
- Explainable rank
- Lead list

## Milestone 6: Capacity optimizer

- Capacity constraints
- Candidate combinations
- Recommended society portfolio

## Milestone 7: Dashboard

- Farm setup
- Lead table
- Map
- Society details
- Allocation recommendation

## Milestone 8: Outreach feedback

- Contact tracking
- Conversion outcomes
- Rejection reasons

## Milestone 9: Phase 2 ML

- Training dataset
- Baseline model
- Evaluation
- Probability calibration
- Ranking model
- Comparison against Phase 1

---

# 28. Metrics for Evaluation

The project should not measure itself only by model accuracy.

## Phase 1

Evaluate:

- Top-N relevance
- Capacity utilization
- Expected commercial value
- Ranking consistency
- Data completeness
- Data freshness
- Provider ingestion success

## Phase 2

Evaluate:

- ROC-AUC where classification is appropriate
- Precision@K
- Recall@K
- PR-AUC for imbalanced outcomes
- Calibration of predicted probabilities
- Lift against rule-based baseline
- Business value generated by the top-ranked leads

For a sales-ranking system, **Precision@K and business lift may be more useful than raw accuracy**.

---

# 29. Example End-to-End Flow

User enters:

```text
Farm: Pune Solar Farm
Capacity: 5 MW
Location: 18.52, 73.85
Maximum distance: 50 km
```

The platform:

```text
1. Loads candidate societies
2. Resolves duplicates
3. Geocodes missing locations
4. Finds relevant building/geographic enrichment
5. Loads available energy data
6. Calculates distance
7. Estimates commercial opportunity
8. Applies business rules
9. Calculates priority
10. Finds best capacity combination
11. Generates explanations
12. Displays results
```

Output:

```text
TOP LEADS

#1 Green Valley Residency
#2 Sunrise Heights
#3 Lakeview Towers
#4 Riverfront Residency
...
```

and:

```text
RECOMMENDED PORTFOLIO

Green Valley        1.20 MW
Lakeview             1.60 MW
Sunrise              0.90 MW
Skyline              0.80 MW
Riverfront           0.45 MW
--------------------------------
Allocated             4.95 MW
Unused                0.05 MW
```

After outreach:

```text
Green Valley -> Converted
Sunrise       -> Rejected: tariff not attractive
Lakeview      -> Negotiation
Riverfront    -> No response
```

Those outcomes go back into the platform and eventually become model-training data.

---

# 30. Final Architecture Recommendation

The architecture I recommend is:

```text
                    +-----------------------+
                    |   MANY DATA SOURCES   |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |    SOURCE ADAPTERS    |
                    |  one adapter/source   |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   RAW DATA STORAGE    |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   CANONICAL SCHEMA    |
                    +-----------+-----------+
                                |
             +------------------+------------------+
             |                  |                  |
             v                  v                  v
      Data Quality       Entity Resolution    Enrichment
             |                  |                  |
             +------------------+------------------+
                                |
                    +-----------v-----------+
                    |   FEATURE GENERATION  |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |   DECISION ENGINE     |
                    |                       |
                    | Rules + ML Scoring   |
                    | Capacity Allocation  |
                    +-----------+-----------+
                                |
                    +-----------v-----------+
                    |     OUTPUT LAYER      |
                    +-----------+-----------+
                                |
                +---------------+---------------+
                |               |               |
                v               v               v
             Dashboard        CSV/API        Map View
                                |
                                v
                     Outreach / CRM feedback
                                |
                                v
                     Conversion Outcome DB
                                |
                                v
                     ML Training Pipeline
```

---

# 31. My Strongest Recommendations

### Recommendation 1: Make the canonical schema the heart of the system

This is the most important architectural decision.

### Recommendation 2: Keep raw, normalized and derived data separate

This gives reproducibility, debugging capability and multi-provider support.

### Recommendation 3: Make every provider an adapter

Adding a provider should be an isolated engineering task.

### Recommendation 4: Treat missing data as a normal condition

Real-world datasets will be incomplete.

### Recommendation 5: Keep ranking and allocation as separate modules

They solve different business problems.

### Recommendation 6: Do not call Phase 1 a conversion prediction model

Call it a prioritization/ranking system.

### Recommendation 7: Build the outreach feedback mechanism early

It is what eventually makes the ML phase genuinely valuable.

### Recommendation 8: Track provenance for every important value

You need to know where each number came from.

### Recommendation 9: Start with Maharashtra and one farm

Prove the architecture before scaling geographically.

### Recommendation 10: Test the architecture by adding a second provider

The second provider should require an adapter, not a rewrite.

---

# 32. First Prototype Dataset Combination

For a practical prototype, the recommended starting combination is:

```text
MahaRERA
    |
    +--> Society/project universe

Google Open Buildings
    |
    +--> Building/geographic enrichment

SEIL-R
    |
    +--> Indian residential energy behavior

Synthetic/client energy data
    |
    +--> Society-level consumption prototype

Client/licensed contact data
    |
    +--> Decision-maker information

Manual/simulated outreach outcomes
    |
    +--> Phase 2 conversion labels
```

This gives the project enough real-world structure to demonstrate a serious data-engineering architecture without pretending that a public dataset contains proprietary commercial information that it does not actually contain.

---

# 33. Definition of Done for the Core Platform

The architecture should be considered successful when all of the following are true:

- A new provider can be added without modifying the ranking engine.
- Raw source data remains available for audit/debugging.
- Multiple providers can represent the same society without creating duplicate canonical entities.
- Missing fields do not break the entire pipeline.
- Every important value has provenance.
- A farm can be configured independently of the society dataset.
- The platform can produce a prioritized outreach list.
- The platform can produce a capacity allocation recommendation.
- The dashboard explains why a society was prioritized.
- Outreach outcomes can be captured.
- The system can later train an ML model from real outcomes.

The most important architectural test remains:

> **Add a completely new provider. If the only substantial change is implementing a new adapter and field mapping, the architecture is working.**

---

# 34. Sources and References

1. Maharashtra Real Estate Regulatory Authority, official project search and registered-project portal: https://www.maharera.maharashtra.gov.in/ 
2. IEEE PES Data Sharing, SEIL-R Mumbai residential electricity consumption dataset: https://ieee-pes-data-sharing.org/datasets/detail/1a8a72fb-bc65-4990-8003-ed42d9c7c2c8 
3. Google Research, Open Buildings: https://sites.research.google/gr/open-buildings/ 
4. Microsoft GlobalMLBuildingFootprints: https://github.com/microsoft/GlobalMLBuildingFootprints 
5. Maharashtra Cooperation Department, Primary Co-operative Housing Societies statistics: https://sahakarayukta.maharashtra.gov.in/Site/Statistic/PrimaryCooperativeHousingSocieties.aspx 

---

# 35. Relation to the Existing Proposal

The source proposal defines Phase 1 around data ingestion, consolidation, configurable ranking, optimal allocation and a lightweight dashboard, followed by Phase 2 ML refinement using actual pitch outcomes. This document retains those goals but recommends a stronger reusable architecture around them: canonical schemas, source adapters, provenance, entity resolution, enrichment, explicit feature layers and independent decision modules.

In other words:

> **Keep the proposal's business objectives, but build the technical foundation as a reusable data platform rather than as a pipeline tied to the first dataset you receive.**

