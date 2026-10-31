from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    status = Column(String, default="Ativo (BD)")
    suspended_until = Column(DateTime, nullable=True)

    # Relação com os logs de auditoria (com CASCADE para apagar e libertar memória automaticamente)
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")

class PrivateMessage(Base):
    __tablename__ = "private_messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_username = Column(String, index=True)
    recipient_username = Column(String, index=True)
    content = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    username = Column(String, index=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    dispositivo = Column(String, nullable=True)          # Desktop, Mobile, Tablet
    sistema_operacional = Column(String, nullable=True) # Windows, Android, iOS, etc.
    navegador = Column(String, nullable=True)          # Chrome, Firefox, Safari
    localizacao = Column(String, nullable=True, default="Desconhecida / Localhost")
    acao = Column(String, default="LOGIN_SUCESSO")     # Ação executada (ex: LOGIN, LOGOUT)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    # Relação de volta com o Utilizador
    user = relationship("User", back_populates="audit_logs")