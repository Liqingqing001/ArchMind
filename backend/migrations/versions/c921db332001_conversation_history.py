"""Persist separate conversation histories without credentials."""
from alembic import op
import sqlalchemy as sa

revision = "c921db332001"
down_revision = "b742fd110aca"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("messages", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.String(40), nullable=False),
        sa.Column("deleted_at", sa.String(40), nullable=True))
    op.create_index("ix_conversations_updated_at", "conversations", ["updated_at"])


def downgrade():
    op.drop_index("ix_conversations_updated_at", table_name="conversations")
    op.drop_table("conversations")
