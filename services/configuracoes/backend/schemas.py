from pydantic import BaseModel
from typing import Optional

class ConfiguracaoResponse(BaseModel):
    tema: Optional[str] = "escuro"
    cor_personalizada: Optional[str] = "#ffffff"
    notificacoes_comunidade: Optional[bool] = True
    notificacoes_projetos: Optional[bool] = True
    notificacoes_email: Optional[bool] = True
    notificacoes_push: Optional[bool] = True
    perfil_publico: Optional[bool] = True
    mostrar_email: Optional[bool] = False
    ultima_atualizacao: Optional[str] = None

    class Config:
        orm_mode = True

class ConfiguracaoUpdate(BaseModel):
    tema: str
    cor_personalizada: Optional[str] = "#ffffff"
    notificacoes_comunidade: bool
    notificacoes_projetos: bool
    notificacoes_email: bool
    notificacoes_push: bool
    perfil_publico: bool
    mostrar_email: bool

class AlterarSenhaRequest(BaseModel):
    senha_atual: str
    nova_senha: str