import os
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
import models
import database
import schemas

SECRET_KEY = "ludarium_super_secret_key_jwt"
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

app = FastAPI(title="Serviço de Configurações - Ludarium", version="1.0.0")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "../frontend"))

if os.path.exists(FRONTEND_DIR):
    app.mount("/configuracoes", StaticFiles(directory=FRONTEND_DIR), name="configuracoes_frontend")

@app.on_event("startup")
async def startup_event():
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
        
    migrations = [
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS tema VARCHAR DEFAULT 'escuro';",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS cor_personalizada VARCHAR DEFAULT '#ffffff';",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS notificacoes_comunidade BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS notificacoes_projetos BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS notificacoes_email BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS notificacoes_push BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS perfil_publico BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS mostrar_email BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE configuracoes_utilizadores ADD COLUMN IF NOT EXISTS ultima_atualizacao VARCHAR;"
    ]
    for mig in migrations:
        try:
            async with database.engine.begin() as conn:
                await conn.execute(text(mig))
        except Exception as e:
            print(f"Aviso na migração DDL de configurações: {e}")

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
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub") or payload.get("email")
        if not email:
            raise credentials_exception
        return email
    except JWTError:
        raise credentials_exception

@app.get("/configuracoes/eu", response_model=schemas.ConfiguracaoResponse)
async def obter_configuracoes(
    db: AsyncSession = Depends(database.obter_base_de_dados),
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    result = await db.execute(select(models.ConfiguracaoModel).filter(models.ConfiguracaoModel.utilizador_email == utilizador_email))
    config = result.scalars().first()
    
    if not config:
        config = models.ConfiguracaoModel(
            utilizador_email=utilizador_email,
            tema="escuro",
            cor_personalizada="#ffffff",
            notificacoes_comunidade=True,
            notificacoes_projetos=True,
            notificacoes_email=True,
            notificacoes_push=True,
            perfil_publico=True,
            mostrar_email=False,
            ultima_atualizacao=datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
        
    return config

@app.put("/configuracoes/eu", response_model=schemas.ConfiguracaoResponse)
async def atualizar_configuracoes(
    dados: schemas.ConfiguracaoUpdate,
    db: AsyncSession = Depends(database.obter_base_de_dados),
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    result = await db.execute(select(models.ConfiguracaoModel).filter(models.ConfiguracaoModel.utilizador_email == utilizador_email))
    config = result.scalars().first()
    
    if not config:
        config = models.ConfiguracaoModel(utilizador_email=utilizador_email)
        db.add(config)

    config.tema = dados.tema
    config.cor_personalizada = dados.cor_personalizada
    config.notificacoes_comunidade = dados.notificacoes_comunidade
    config.notificacoes_projetos = dados.notificacoes_projetos
    config.notificacoes_email = dados.notificacoes_email
    config.notificacoes_push = dados.notificacoes_push
    config.perfil_publico = dados.perfil_publico
    config.mostrar_email = dados.mostrar_email
    config.ultima_atualizacao = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    await db.commit()
    await db.refresh(config)
    return config

@app.post("/configuracoes/alterar-senha")
async def alterar_senha(
    dados: schemas.AlterarSenhaRequest,
    db: AsyncSession = Depends(database.obter_base_de_dados),
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    if len(dados.nova_senha) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter pelo menos 6 caracteres.")
    
    result = await db.execute(select(models.UserModel).filter(models.UserModel.email == utilizador_email))
    utilizador = result.scalars().first()
    
    if not utilizador:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    
    utilizador.hashed_password = dados.nova_senha
    await db.commit()
    return {"mensagem": "Senha alterada com sucesso!"}

    