"""Save user feedback and frozen scenario solutions without publishing model facts."""
from alembic import op
import sqlalchemy as sa
revision = 'f253dc002315'
down_revision = 'e142cb991204'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('solution_cases',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('conversation_id', sa.String(36), sa.ForeignKey('conversations.id'), nullable=False),
        sa.Column('message_id', sa.String(36), nullable=False),
        sa.Column('rating', sa.String(12), nullable=False),
        sa.Column('scene_id', sa.String(40), nullable=False),
        sa.Column('scene_name', sa.String(120), nullable=False),
        sa.Column('title', sa.String(120), nullable=False),
        sa.Column('answer', sa.Text(), nullable=False),
        sa.Column('brief', sa.JSON(), nullable=False),
        sa.Column('references', sa.JSON(), nullable=False),
        sa.Column('trace_id', sa.String(36), nullable=False),
        sa.Column('model', sa.String(200), nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('evidence_status', sa.String(40), nullable=False),
        sa.Column('created_at', sa.String(40), nullable=False),
        sa.Column('updated_at', sa.String(40), nullable=False),
        sa.UniqueConstraint('conversation_id', 'message_id'))
    op.create_index('ix_solution_cases_scene_id', 'solution_cases', ['scene_id'])


def downgrade():
    op.drop_index('ix_solution_cases_scene_id', table_name='solution_cases')
    op.drop_table('solution_cases')
