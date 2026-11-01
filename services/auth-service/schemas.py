# Caminho: auth-service/schemas.py
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    analytics_opt_in: Optional[bool] = False  # Novo campo LGPD Opt-In

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
    severidade: Optional[str] = "BAIXA"          # Adicionado para suportar análise de ameaças
    detalhes_payload: Optional[str] = None     # Adicionado para registar payloads suspeitos
    timestamp: datetime

    class Config:
        from_attributes = True

class DossieCibersegurancaResponse(BaseModel):
    metadados_relatorio: Dict[str, Any]
    resumo_executivo: Dict[str, Any]
    moderacao_foruns: List[Any]
    forense_telemetria_acessos: List[AuditLogResponse]
    tentativas_intrusao_bloqueadas: Optional[int] = 0