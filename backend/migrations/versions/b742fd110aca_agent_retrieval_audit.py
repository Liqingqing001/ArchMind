"""Add caller and filter context to shared knowledge retrieval traces."""
from alembic import op
import sqlalchemy as sa

revision = "b742fd110aca"
down_revision = "ac36bd1b8db5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("retrieval_traces", sa.Column("caller", sa.String(30), nullable=False, server_default="console"))
    op.add_column("retrieval_traces", sa.Column("request_context", sa.JSON(), nullable=False, server_default="{}"))
    op.create_index("ix_retrieval_traces_caller", "retrieval_traces", ["caller"])


def downgrade():
    op.drop_index("ix_retrieval_traces_caller", table_name="retrieval_traces")
    op.drop_column("retrieval_traces", "request_context")
    op.drop_column("retrieval_traces", "caller")
