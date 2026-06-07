# backend/ — FastAPI (scaffolded in Step 2)

Empty until Step 2. Will contain the FastAPI app per `MASTER.md` §9:

```
app/
  main.py
  core/      config, security (JWT/JWKS), rls, logging (PHI-redacting)
  db/        session, base, alembic migrations
  models/    SQLModel: org, user, membership, patient, visit, study, scan,
             context, measurement, implant, three_d_implant, pedicle_simulation,
             report, audit
  schemas/   Pydantic (mirror docs/openapi.yaml)
  api/v1/    auth, patients, visits, studies, contexts, reports, dicom
  deps/      get_current_user, require_role, get_org_db (sets RLS)
  services/  orthanc_client, storage(s3), audit, context_diff
  workers/   dicom ingest, thumbnails, pdf reports
```

Adding `pyproject.toml` here activates the CI `backend` job automatically.
Contracts to implement against: [`../docs/data-model.md`](../docs/data-model.md),
[`../docs/openapi.yaml`](../docs/openapi.yaml).
