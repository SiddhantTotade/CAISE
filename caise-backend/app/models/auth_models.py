from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Table, Text, false
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
    # Anonymous session: may chat and index public repositories only; no Settings / API keys.
    is_guest = Column(Boolean, nullable=False, default=False, server_default=false())

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
    last_index_commit = Column(String, nullable=True)
    # Set when an index run finishes successfully (timezone-aware UTC).
    updated_at = Column(DateTime(timezone=True), nullable=True)
    # {"mode": "full"|"incremental"|"unchanged", "modified": [...], "added": [...], "deleted": [...]}
    last_index_changes = Column(JSON, nullable=True)


class UserApiKey(Base):
    """A user's own LLM provider key, Fernet-encrypted at rest. The plaintext is never returned by the API."""

    __tablename__ = "user_api_keys"
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    provider = Column(String, primary_key=True)
    ciphertext = Column(String, nullable=False)
    hint = Column(String, nullable=False)  # last characters of the key, for display only
    updated_at = Column(DateTime(timezone=True), nullable=False)


class Chat(Base):
    __tablename__ = "chats"
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    repo_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False)

    messages = relationship(
        "ChatMessage", back_populates="chat", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )

    __table_args__ = (Index("ix_chats_user_updated", "user_id", "updated_at"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(String, ForeignKey("chats.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False, default="")
    sources = Column(JSON, nullable=True)
    provider = Column(String, nullable=True)
    model = Column(String, nullable=True)
    error = Column(String, nullable=True)
    stopped = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False)

    chat = relationship("Chat", back_populates="messages")
