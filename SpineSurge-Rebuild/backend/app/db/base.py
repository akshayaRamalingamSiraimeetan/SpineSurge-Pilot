"""Single import surface for Alembic and tooling.

Importing app.models populates SQLModel.metadata with every table. `target_metadata` is what
Alembic's env.py uses for migrations.
"""

from sqlmodel import SQLModel

import app.models  # noqa: F401  (side effect: registers all tables on the metadata)

target_metadata = SQLModel.metadata
