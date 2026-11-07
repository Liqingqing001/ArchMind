"""Keep automatic topic summaries separate from manually chosen titles."""
from alembic import op
import sqlalchemy as sa

revision = 'e142cb991204'
down_revision = 'd0837d99bb12'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('conversations', sa.Column('title_mode', sa.String(12), nullable=False, server_default='manual'))
    # A legacy custom-looking title has no reliable ownership metadata: preserve it.
    table = sa.table('conversations', sa.column('title'), sa.column('title_mode'))
    op.get_bind().execute(table.update().where(table.c.title == '新对话').values(title_mode='auto'))


def downgrade():
    op.drop_column('conversations', 'title_mode')
