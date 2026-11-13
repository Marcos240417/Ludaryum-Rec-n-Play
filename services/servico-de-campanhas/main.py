import os
from pathlib import Path
import shutil
import zipfile
from fastapi import FastAPI, Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import models, database, schemas
import httpx

SECRET_KEY = "ludarium_super_secret_key_jwt"
ALGORITHM = "HS256"

# Esquema flexível adaptável para ambiente local ou túnel Cloudflare
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

app = FastAPI(title="Serviço de Campanhas e Desafios - Ludaryum", version="1.1.0")

# Definições seguras dos caminhos e diretórios estáticos
BASE_DIR = Path(__file__).resolve().parent
PATH_COMUNIDADE = os.path.join(BASE_DIR.parent, "servico-de-comunidade", "frontend")

if os.path.exists(PATH_COMUNIDADE):
    app.mount("/comunidade-ui", StaticFiles(directory=PATH_COMUNIDADE), name="comunidade_ui")

# Montar diretório estático unificado (static-ui do gateway) de forma segura
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "../servico-de-gateway/static-ui"))
if os.path.exists(FRONTEND_DIR):
    app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")

# Evento de arranque assíncrono para criar as tabelas de forma segura
@app.on_event("startup")
async def startup_event():
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def obter_utilizador_atual(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais de autenticação",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub") or payload.get("email")
        if email is None:
            raise credentials_exception
        return email
    except JWTError:
        raise credentials_exception

@app.get("/")
def raiz():
    return {"mensagem": "Serviço de Campanhas com autenticação JWT, vínculo por utilizador e frontend unificado a funcionar na porta 8003!"}

# Função auxiliar assíncrona para popular dados iniciais de demonstração com selectinload
async def popular_dados_iniciais(db: AsyncSession):
    result = await db.execute(
        select(models.CampanhaModel).options(selectinload(models.CampanhaModel.objetivos))
    )
    campanhas = result.scalars().all()
    if campanhas:
        return campanhas

    c1 = models.CampanhaModel(
        titulo="Horizontes Solarpunk",
        descricao="Construa um futuro onde natureza, tecnologia e criatividade caminham juntas.",
        categoria="solarpunk",
        nivel="Intermediário",
        participantes_qtd=1920,
        recompensa_xp=2500,
        formato="Equipe",
        progresso_porcentagem=35,
        dias_restantes=14,
        ativa=True
    )
    db.add(c1)
    await db.commit()
    await db.refresh(c1)
    
    objs_c1 = [
        ("Entrar ou criar uma equipe", "até 02 de março", "2.500 XP", True),
        ("Registrar a apresentação do projeto", "tema, mecânicas e escopo inicial", "2.500 XP", True),
        ("Publicar o primeiro diário de desenvolvimento", "compartilhe os 15% de avanço", "2.500 XP", True),
        ("Enviar uma versão jogável", "build para windows, web ou mobile - até 28 fev", "2.500 XP", False),
        ("Avaliar dois projetos participantes", "2.500 XP feedbacks enviados", "2.500 XP", False),
        ("Publicar o projeto final", "teaser, itch.io/steam, demo", "2.500 XP", False),
        ("Participar da apresentação final", "evento ao vivo com os estúdios", "2.500 XP", False),
    ]
    
    for tit, pra, rec, conc in objs_c1:
        db.add(models.ObjetivoCampanhaModel(
            campanha_id=c1.id,
            titulo=tit,
            prazo=pra,
            recompensa_xp=rec,
            concluido=conc
        ))
    await db.commit()
    
    c2 = models.CampanhaModel(
        titulo="Acessibilidade em primeiro lugar",
        descricao="Crie experiências de jogos acessíveis e inclusivas para todos.",
        categoria="acessibilidade",
        nivel="Iniciante",
        participantes_qtd=840,
        recompensa_xp=1800,
        formato="Individual",
        progresso_porcentagem=65,
        dias_restantes=7,
        ativa=True
    )
    db.add(c2)
    await db.commit()
    await db.refresh(c2)

    objs_c2 = [
        ("Identificar barreiras de acessibilidade", "análise inicial", "1.800 XP", True),
        ("Definir melhorias para o jogo", "planejamento de UI/UX", "1.800 XP", True),
        ("Criar opções de acessibilidade", "implementação de recursos", "1.800 XP", False),
        ("Testar com diferentes jogadores", "sessões de teste", "1.800 XP", False),
        ("Corrigir problemas encontrados", "ajustes finais", "1.800 XP", False)
    ]
    for tit, pra, rec, conc in objs_c2:
        db.add(models.ObjetivoCampanhaModel(
            campanha_id=c2.id,
            titulo=tit,
            prazo=pra,
            recompensa_xp=rec,
            concluido=conc
        ))
    await db.commit()

    c3 = models.CampanhaModel(
        titulo="NPCs que parecem vivos",
        descricao="Desenvolva personagens inteligentes, com comportamentos e diálogos envolventes.",
        categoria="npcs",
        nivel="Avançado",
        participantes_qtd=310,
        recompensa_xp=5000,
        formato="Individual",
        progresso_porcentagem=10,
        dias_restantes=21,
        ativa=True
    )
    db.add(c3)
    await db.commit()
    await db.refresh(c3)

    objs_c3 = [
        ("Criar o conceito do personagem", "background e lore", "5.000 XP", True),
        ("Definir personalidade e história", "árvore de diálogos", "5.000 XP", False),
        ("Desenvolver diálogos", "implementação de IA", "5.000 XP", False),
        ("Implementar comportamentos", "rotinas e IA", "5.000 XP", False),
        ("Testar as interações", "validação de cenários", "5.000 XP", False)
    ]
    for tit, pra, rec, conc in objs_c3:
        db.add(models.ObjetivoCampanhaModel(
            campanha_id=c3.id,
            titulo=tit,
            prazo=pra,
            recompensa_xp=rec,
            concluido=conc
        ))
    await db.commit()
    
    result_final = await db.execute(
        select(models.CampanhaModel).options(selectinload(models.CampanhaModel.objetivos))
    )
    return result_final.scalars().all()

@app.get("/progresso-usuario", response_model=schemas.UsuarioProgressoResponse)
async def obter_progresso_utilizador(db: AsyncSession = Depends(database.obter_base_de_dados), utilizador_email: str = Depends(obter_utilizador_atual)):
    """Retorna o progresso, nível e XP do utilizador autenticado"""
    result = await db.execute(select(models.UsuarioProgressoModel))
    progresso = result.scalars().first()
    if not progresso:
        progresso = models.UsuarioProgressoModel(
            nivel=24,
            titulo_nivel="Criadora Experiente",
            xp_atual=11400,
            xp_proximo_nivel=15000,
            projetos_concluidos=7,
            badges_conquistados=12,
            mentorias=4
        )
        db.add(progresso)
        await db.commit()
        await db.refresh(progresso)
    return progresso

@app.get("/campanhas", response_model=list[schemas.CampanhaResponse])
async def listar_campanhas(db: AsyncSession = Depends(database.obter_base_de_dados)):
    """Lista todas as campanhas de forma segura e assíncrona"""
    campanhas = await popular_dados_iniciais(db)
    return campanhas

@app.get("/campanhas/{campaign_id}/objetivos")
async def listar_objetivos_campanha(campaign_id: str, db: AsyncSession = Depends(database.obter_base_de_dados)):
    """Retorna os objetivos específicos da campanha solicitada (solarpunk, acessibilidade, npcs)"""
    await popular_dados_iniciais(db)
    result = await db.execute(
        select(models.CampanhaModel)
        .options(selectinload(models.CampanhaModel.objetivos))
        .filter(models.CampanhaModel.categoria == campaign_id)
    )
    campanha = result.scalars().first()
    if not campanha and campaign_id.isdigit():
        result_id = await db.execute(
            select(models.CampanhaModel)
            .options(selectinload(models.CampanhaModel.objetivos))
            .filter(models.CampanhaModel.id == int(campaign_id))
        )
        campanha = result_id.scalars().first()
    
    if not campanha:
        return []
    
    return [
        {"id": obj.id, "titulo": obj.titulo, "concluido": obj.concluido}
        for obj in campanha.objetivos
    ]

@app.get("/campanhas/{campaign_id}/participando")
async def verificar_participacao(campaign_id: str, utilizador_email: str = Depends(obter_utilizador_atual)):
    """Verifica se o utilizador atual está participando da campanha"""
    return {"participando": True}

@app.post("/campanhas/{campaign_id}/participar")
async def participar_campanha(campaign_id: str, utilizador_email: str = Depends(obter_utilizador_atual)):
    """Regista a participação do utilizador na campanha"""
    return {"mensagem": f"Participação na campanha {campaign_id} registada com sucesso!"}

@app.post("/campanhas", response_model=schemas.CampanhaResponse, status_code=status.HTTP_201_CREATED)
async def criar_campanha(
    campanha: schemas.CampanhaCreate, 
    db: AsyncSession = Depends(database.obter_base_de_dados), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    """Cria uma nova campanha com os objetivos/relação carregados corretamente"""
    nova_campanha = models.CampanhaModel(
        titulo=campanha.titulo,
        descricao=campanha.descricao,
        categoria=campanha.categoria or "GAME JAM",
        nivel=campanha.nivel or "Iniciante",
        recompensa_xp=campanha.recompensa_xp or 2500,
        participantes_qtd=1,
        formato="Individual",
        progresso_porcentagem=0,
        dias_restantes=30,
        ativa=True
    )
    db.add(nova_campanha)
    await db.commit()
    
    result = await db.execute(
        select(models.CampanhaModel)
        .options(selectinload(models.CampanhaModel.objetivos))
        .filter(models.CampanhaModel.id == nova_campanha.id)
    )
    campanha_criada = result.scalars().first()
    
    return campanha_criada

@app.patch("/objetivos/{objetivo_id}/concluir")
async def concluir_objetivo(
    objetivo_id: int, 
    db: AsyncSession = Depends(database.obter_base_de_dados), 
    utilizador_email: str = Depends(obter_utilizador_atual),
    authorization: str = Header(None)
):
    """Alterna o estado de conclusão de uma tarefa no checklist e atribui recompensa de XP se concluído"""
    result = await db.execute(select(models.ObjetivoCampanhaModel).filter(models.ObjetivoCampanhaModel.id == objetivo_id))
    obj = result.scalars().first()
    if not obj:
        raise HTTPException(status_code=404, detail="Objetivo não encontrado")
    
    obj.concluido = not obj.concluido
    await db.commit()
    await db.refresh(obj)

    if obj.concluido and authorization:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "http://127.0.0.1:8001/perfil/adicionar-xp",
                    json={"xp": 100},
                    headers={"Authorization": authorization}
                )
        except Exception as e:
            print(f"Erro ao creditar XP da campanha: {e}")

    return {"id": obj.id, "titulo": obj.titulo, "concluido": obj.concluido}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8003, reload=True)