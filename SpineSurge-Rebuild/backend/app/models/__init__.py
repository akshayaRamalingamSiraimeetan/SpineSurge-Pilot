"""All ORM models. Importing this package registers every table on SQLModel.metadata."""

from app.models.clinical import Patient, Report, Scan, Study, Visit
from app.models.library import Collection, CollectionStudy
from app.models.tenancy import AuditLog, Membership, Org, User
from app.models.workspace import (
    Context,
    ContextStudy,
    Implant,
    Measurement,
    PedicleSimulation,
    ThreeDImplant,
)

# Tables protected by Row-Level Security (every table carrying org_id).
# Used by the baseline migration to apply RLS policies. orgs/users are global (not listed).
TENANT_SCOPED_TABLES: tuple[str, ...] = (
    "memberships",
    "audit_log",
    "patients",
    "visits",
    "studies",
    "scans",
    "reports",
    "contexts",
    "context_studies",
    "measurements",
    "implants",
    "three_d_implants",
    "pedicle_simulations",
    "collections",
    "collection_studies",
)

__all__ = [
    "Org",
    "User",
    "Membership",
    "AuditLog",
    "Patient",
    "Visit",
    "Study",
    "Scan",
    "Report",
    "Context",
    "ContextStudy",
    "Measurement",
    "Implant",
    "ThreeDImplant",
    "PedicleSimulation",
    "Collection",
    "CollectionStudy",
    "TENANT_SCOPED_TABLES",
]
