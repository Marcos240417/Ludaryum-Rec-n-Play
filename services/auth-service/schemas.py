# Caminho: auth-service/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

class UserCreate(BaseModel):
    nome_completo: Optional[str] = None
    username: str
    email: EmailStr
    password: str
    analytics_opt_in: Optional[bool] = False  # LGPD Opt-In
    provider: Optional[str] = "local"         # 'local', 'google', 'github'

class UserResponse(BaseModel):
    id: int
    nome_completo: Optional[str] = None
    username: str
    email: str
    status: Optional[str] = "Ativo (BD)"
    provider: Optional[str] = "local"
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class AuditLogResponse(BaseModel):
    id: int
    username: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    dispositivo: Optional[str] = None
    sistema_operacional: Optional[str] = None
    navegador: Optional[str] = None
    localizacao: Optional[str] = None
    acao: Optional[str] = None
    severidade: Optional[str] = "BAIXA"          # Suporte a análise de ameaças
    detalhes_payload: Optional[str] = None     # Registo de payloads suspeitos
    timestamp: datetime

    class Config:
        from_attributes = True

class DossieCibersegurancaResponse(BaseModel):
    metadados_relatorio: Dict[str, Any]
    resumo_executivo: Dict[str, Any]
    moderacao_foruns: List[Any]
    forense_telemetria_acessos: List[AuditLogResponse]
    tentativas_intrusao_bloqueadas: Optional[int] = 0