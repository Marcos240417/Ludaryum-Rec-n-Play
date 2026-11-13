# Caminho: auth-service/models.py
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    nome_completo = Column(String, nullable=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    status = Column(String, default="Ativo (BD)")
    suspended_until = Column(DateTime, nullable=True)
    provider = Column(String, default="local") # 'local', 'google', 'github'
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relações
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    consent = relationship("UserConsent", back_populates="user", uselist=False, cascade="all, delete-orphan")

class UserConsent(Base):
    __tablename__ = "user_consents"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    analytics_opt_in = Column(Boolean, default=False)
    consent_date = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="consent")

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
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True) # Permitir null para tentativas de invasão de utilizadores não cadastrados
    username = Column(String, index=True, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    dispositivo = Column(String, nullable=True)
    sistema_operacional = Column(String, nullable=True)
    navegador = Column(String, nullable=True)
    localizacao = Column(String, nullable=True, default="Desconhecida / Localhost")
    acao = Column(String, default="LOGIN_SUCESSO") # Ex: LOGIN_SUCESSO, FALHA_AUTENTICACAO, TENTATIVA_INTRUSAO_BRUTE_FORCE
    severidade = Column(String, default="BAIXA") # BAIXA, MEDIA, ALTA, CRITICA
    detalhes_payload = Column(Text, nullable=True) # Registo adicional para análise forense ou tentativas suspeitas
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")