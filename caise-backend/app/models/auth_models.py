from sqlalchemy import Column,String,Table,ForeignKey,JSON
from sqlalchemy.orm import relationship

from app.core.database import Base

user_orgs = Table(
    "user_organizations",
    Base.metadata,
    Column("user_id", String, ForeignKey("users.id"), primary_key=True),
    Column("org_id", String, ForeignKey("organizations.id"), primary_key=True),
    Column("role", String, default="member")
)

class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)

    organizations = relationship("Organization", secondary=user_orgs, back_populates="members")

class Organization(Base):
    __tablename__ = "organizations"
    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    members = relationship("User", secondary=user_orgs, back_populates="organizations")

class RepositoryMetadata(Base):
    __tablename__ = "repository_metadata"
    repo_id = Column(String, primary_key=True)
    repo_url = Column(String, nullable=False)
    branch = Column(String, nullable=False)
    org_id = Column(String, nullable=True)
    owner_id = Column(String, nullable=False)
    allowed_users = Column(JSON, default=list)
    status = Column(String, default="pending")