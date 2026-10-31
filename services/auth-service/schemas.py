from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    status: Optional[str] = "Ativo (BD)"

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# ==========================================
# MODELOS PARA AUDITORIA, TELEMETRIA E DOSSIÊ
# ==========================================

class AuditLogResponse(BaseModel):
    id: int
    username: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    dispositivo: Optional[str] = None
    sistema_operacional: Optional[str] = None
    navegador: Optional[str] = None
    localizacao: Optional[str] = None
    acao: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class DossieCibersegurancaResponse(BaseModel):
    metadados_relatorio: dict
    resumo_executivo: dict
    moderacao_foruns: list
    forense_telemetria_acessos: List[AuditLogResponse]