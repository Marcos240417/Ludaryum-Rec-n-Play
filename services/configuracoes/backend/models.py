from sqlalchemy import Column, Integer, String, Boolean
from database import Base

class ConfiguracaoModel(Base):
    __tablename__ = "configuracoes_utilizadores"

    id = Column(Integer, primary_key=True, index=True)
    utilizador_email = Column(String, unique=True, index=True, nullable=False)
    tema = Column(String, default="escuro")
    cor_personalizada = Column(String, default="#ffffff")
    notificacoes_comunidade = Column(Boolean, default=True)
    notificacoes_projetos = Column(Boolean, default=True)
    notificacoes_email = Column(Boolean, default=True)
    notificacoes_push = Column(Boolean, default=True)
    perfil_publico = Column(Boolean, default=True)
    mostrar_email = Column(Boolean, default=False)
    ultima_atualizacao = Column(String, nullable=True)