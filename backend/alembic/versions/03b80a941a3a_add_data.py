"""Add data

Revision ID: 03b80a941a3a
Revises: 5359b5c71036
Create Date: 2024-06-08 13:00:19.668165

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '03b80a941a3a'
down_revision: Union[str, None] = '5359b5c71036'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
INSERT INTO example (data) VALUES
    ('{"name": "John", "age": 30, "city": "New York"}'),
    ('{"name": "Alice", "age": 25, "city": "Los Angeles"}'),
    ('{"name": "Bob", "age": 35, "city": "Chicago"}');
""")


def downgrade() -> None:
    pass
