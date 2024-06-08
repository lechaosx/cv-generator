"""Initialize schema

Revision ID: 5359b5c71036
Revises: 
Create Date: 2024-06-08 12:38:38.149500

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5359b5c71036'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE IF NOT EXISTS example (
    id SERIAL PRIMARY KEY,
    data TEXT NOT NULL
);
""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS example;")
