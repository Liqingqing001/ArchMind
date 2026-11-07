from typing import Literal
from pydantic import BaseModel, Field, field_validator
from .collector import validate_url


class CategoryInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: str | None = None


class EntityInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: Literal["vendor", "product", "model", "api", "project", "framework", "cloud", "solution"]
    description: str = Field(default="", max_length=10000)
    website: str = Field(default="", max_length=2000)
    category_ids: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("website")
    @classmethod
    def url(cls, value):
        if value:
            validate_url(value)
        return value


class SourceInput(BaseModel):
    entity_id: str
    name: str = Field(min_length=1, max_length=200)
    url: str = Field(max_length=2000)
    source_type: Literal["web", "json", "github", "rss"] = "web"
    interval_hours: int = Field(default=24, ge=1, le=8760)

    @field_validator("url")
    @classmethod
    def url_ok(cls, value):
        validate_url(value)
        return value


class SourcePatch(BaseModel):
    enabled: bool | None = None
    interval_hours: int | None = Field(default=None, ge=1, le=8760)


class ChangeInput(BaseModel):
    entity_id: str
    snapshot_id: str
    key: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=10000)
    evidence: str = Field(min_length=1, max_length=10000)
    base_version: int | None = Field(default=None, ge=0)


class ReviewInput(BaseModel):
    decision: Literal["approved", "rejected"]
    note: str = Field(default="", max_length=2000)


class RelationInput(BaseModel):
    from_id: str
    to_id: str
    relation: str = Field(min_length=1, max_length=80)


class RetrievalInput(BaseModel):
    """The Agent has query/filter access, never a draft/publication switch."""
    query: str = Field(min_length=1, max_length=200)
    entity_ids: list[str] = Field(default_factory=list, max_length=50)
    category_id: str | None = None
    kind: Literal["vendor", "product", "model", "api", "project", "framework", "cloud", "solution"] | None = None
    include_demo: bool = False
    top_k: int = Field(default=10, ge=1, le=30)
    request_id: str | None = Field(default=None, max_length=200)

    @field_validator("query")
    @classmethod
    def query_not_blank(cls, value):
        if not value.strip():
            raise ValueError("查询不能为空")
        return value.strip()
