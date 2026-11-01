from pydantic import BaseModel, HttpUrl, field_validator
from typing import List, Optional, Union

class ComentarioProjetoCreate(BaseModel):
    conteudo: str

class ComentarioProjetoResponse(BaseModel):
    id: int
    project_id: int
    autor: str
    autor_arroba: str
    conteudo: str

    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    title: str
    studio: Optional[str] = "Estúdio Independente"
    description: str
    progress: Optional[int] = 100
    tags: Optional[Union[str, List[str]]] = ""
    executavel_navegador: Optional[int] = 0
    build_path: Optional[str] = None
    poster_path: Optional[str] = None
    campaign_id: Optional[int] = None
    members: Optional[str] = ""
    
    # --- CAMPOS: GITHUB, CÓDIGO ABERTO E COMPLIANCE ---
    github_url: Optional[str] = None
    codigo_aberto: Optional[bool] = False
    aceite_lgpd: bool
    aceite_normas: bool

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        if isinstance(v, list):
            return ", ".join(str(t) for t in v if t)
        return v or ""

class ProjectResponse(BaseModel):
    id: int
    title: str
    studio: Optional[str] = "Estúdio Independente"
    description: str
    progress: Optional[int] = 100
    tags: Optional[Union[str, List[str]]] = ""
    likes: Optional[int] = 0
    favorito: Optional[int] = 0
    executavel_navegador: Optional[int] = 0
    build_path: Optional[str] = None
    poster_path: Optional[str] = None
    campaign_id: Optional[int] = None
    members: Optional[str] = ""
    owner: Optional[str] = None
    user_id: Optional[str] = None
    status: Optional[str] = "Ativo"
    inspection_reason: Optional[str] = None
    inspection_message: Optional[str] = None
    inspection_reply: Optional[str] = None  
    
    # --- CAMPOS NA RESPOSTA ---
    github_url: Optional[str] = None
    codigo_aberto: bool = False
    aceite_lgpd: bool = False
    aceite_normas: bool = False

    comments_count: Optional[int] = 0
    comentarios: List[ComentarioProjetoResponse] = []

    class Config:
        from_attributes = True

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        if isinstance(v, list):
            return ", ".join(str(t) for t in v if t)
        return v or ""

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    progress: Optional[int] = None
    tags: Optional[Union[str, List[str]]] = None
    campaign_id: Optional[int] = None
    members: Optional[str] = None
    inspection_reply: Optional[str] = None  
    github_url: Optional[str] = None
    codigo_aberto: Optional[bool] = None

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v):
        if isinstance(v, list):
            return ", ".join(str(t) for t in v if t)
        return v

class CampaignResponse(BaseModel):
    id: int
    title: str
    subtitle: str
    projects_count: int
    participants_count: int

    class Config:
        from_attributes = True

class CommunityResponse(BaseModel):
    id: int
    name: str
    members_count: str

    class Config:
        from_attributes = True