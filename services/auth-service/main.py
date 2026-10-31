import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
import bcrypt
from datetime import datetime, timedelta
import math
from jose import JWTError, jwt
from user_agents import parse # pip install user-agents
import models, database, schemas

SECRET_KEY = "ludarium_super_secret_key_jwt"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --- CICLO DE VIDA (LIFESPAN) ASSÍNCRONO GLOBAL ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Criação assíncrona das tabelas e migrações automáticas no arranque
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Ativo (BD)';"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;"))
    yield

app = FastAPI(title="Ludarium Auth Service", version="1.1.0", lifespan=lifespan)

# Configuração de CORS global e permissiva para comunicação entre microsserviços e painéis
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def criar_token_acesso(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def parse_datetime(val):
    """Função auxiliar para converter strings de data da BD em objetos datetime com segurança"""
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val)
        except ValueError:
            return None
    return None

async def obter_utilizador_atual(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas, expiradas ou conta removida",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(select(models.User).where(models.User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user

@app.get("/")
def raiz():
    return {"message": "Auth Service a funcionar com Telemetria e Dossiê de Cibersegurança!"}

@app.post("/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
async def registar_utilizador(user: schemas.UserCreate, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(
        select(models.User).where((models.User.username == user.username) | (models.User.email == user.email))
    )
    db_user = result.scalar_one_or_none()
    if db_user:
        raise HTTPException(status_code=400, detail="Nome de utilizador ou email já existente.")

    hashed_password = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    novo_utilizador = models.User(username=user.username, email=user.email, hashed_password=hashed_password, status="Ativo (BD)")
    
    db.add(novo_utilizador)
    await db.commit()
    await db.refresh(novo_utilizador)
    return novo_utilizador

@app.post("/login")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(
        select(models.User).where((models.User.username == form_data.username) | (models.User.email == form_data.username))
    )
    user = result.scalar_one_or_none()
    if not user or not bcrypt.checkpw(form_data.password.encode('utf-8'), user.hashed_password.encode('utf-8')):
        raise HTTPException(status_code=400, detail="Utilizador ou senha incorretos.")

    # Validação rigorosa de suspensão no momento do login com conversão segura
    suspended_dt = parse_datetime(user.suspended_until)
    if suspended_dt and suspended_dt > datetime.utcnow():
        restante = suspended_dt - datetime.utcnow()
        dias = restante.days
        horas = math.ceil(restante.seconds / 3600)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Conta suspensa. Faltam aproximadamente {dias} dia(s) e {horas} hora(s) para o término da suspensão."
        )
    elif suspended_dt and suspended_dt <= datetime.utcnow():
        user.status = "Ativo (BD)"
        user.suspended_until = None
        await db.commit()

    # --- RECOLHA DE TELEMETRIA E AUDITORIA FORENSE NO LOGIN ---
    user_agent_string = request.headers.get("user-agent", "")
    parsed_ua = parse(user_agent_string)
    
    ip_client = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "127.0.0.1")
    
    tipo_disp = "Desktop"
    if parsed_ua.is_mobile:
        tipo_disp = "Telemóvel (Mobile)"
    elif parsed_ua.is_tablet:
        tipo_disp = "Tablet"

    novo_log = models.AuditLog(
        user_id=user.id,
        username=user.username or user.email,
        ip_address=ip_client,
        user_agent=user_agent_string,
        dispositivo=tipo_disp,
        sistema_operacional=f"{parsed_ua.os.family} {parsed_ua.os.version_string}".strip(),
        navegador=f"{parsed_ua.browser.family} {parsed_ua.browser.version_string}".strip(),
        localizacao="Brasil / Local (Detectado por IP)",
        acao="LOGIN_SUCESSO"
    )
    db.add(novo_log)
    await db.commit()
    # ----------------------------------------------------------

    access_token = criar_token_acesso(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/me", response_model=schemas.UserResponse)
async def obter_perfil_atual(current_user: models.User = Depends(obter_utilizador_atual)):
    return current_user

# ==========================================
# VERIFICAÇÃO DE ESTADO PARA O PAINEL DO UTILIZADOR
# ==========================================
@app.get("/users/me/suspension-status")
async def verificar_suspensao_propria(current_user: models.User = Depends(obter_utilizador_atual), db: AsyncSession = Depends(database.get_db)):
    suspended_dt = parse_datetime(current_user.suspended_until)
    if suspended_dt and suspended_dt > datetime.utcnow():
        restante = suspended_dt - datetime.utcnow()
        dias = restante.days
        horas = math.ceil(restante.seconds / 3600)
        return {
            "suspenso": True,
            "mensagem": f"A sua conta encontra-se suspensa. Tempo restante: {dias} dia(s) e {horas} hora(s)."
        }
    
    if suspended_dt and suspended_dt <= datetime.utcnow():
        current_user.status = "Ativo (BD)"
        current_user.suspended_until = None
        await db.commit()

    return {"suspenso": False, "mensagem": "Conta ativa."}

# ==========================================
# GESTÃO DE UTILIZADORES E DOSSIÊ FORENSE (PAINEL ADMIN)
# ==========================================
@app.get("/users")
async def listar_todos_utilizadores(db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.User))
    users = result.scalars().all()
    resultado = []
    for u in users:
        status_atual = u.status
        suspended_dt = parse_datetime(u.suspended_until)
        if suspended_dt and suspended_dt <= datetime.utcnow():
            status_atual = "Ativo (BD)"
            u.status = "Ativo (BD)"
            u.suspended_until = None
            await db.commit()

        resultado.append({
            "id": u.id,
            "email": u.email,
            "username": getattr(u, "username", u.email),
            "status": status_atual,
            "suspended_until": suspended_dt.isoformat() if suspended_dt else None
        })
    return resultado

@app.delete("/users/{user_id}")
async def excluir_utilizador_definitivamente(user_id: int, db: AsyncSession = Depends(database.get_db)):
    """Exclui permanentemente o utilizador. Graças ao CASCADE, todos os logs de auditoria e dados associados são limpos de imediato para poupar memória."""
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    
    await db.delete(user)
    await db.commit()
    return {"message": "Utilizador e todos os seus dados de auditoria associados foram removidos com sucesso, libertando memória."}

@app.get("/admin/dossie-completo", response_model=schemas.DossieCibersegurancaResponse)
async def exportar_dossie_ciberseguranca(db: AsyncSession = Depends(database.get_db)):
    """Gera o Dossiê Completo de Cibersegurança e Auditoria Forense para apresentação no Painel Admin."""
    
    # 1. Métricas Executivas
    total_users_res = await db.execute(select(func.count(models.User.id)))
    total_utilizadores = total_users_res.scalar() or 0

    # 2. Telemetria Forense (Últimos 200 acessos)
    logs_res = await db.execute(select(models.AuditLog).order_by(models.AuditLog.timestamp.desc()).limit(200))
    logs_acesso = logs_res.scalars().all()

    dossie = {
        "metadados_relatorio": {
            "gerado_em": datetime.utcnow().strftime("%d/%m/%Y %H:%M:%S UTC"),
            "sistema": "Ludarium Enterprise Security Suite",
            "nivel_sigilo": "Confidencial - Administração"
        },
        "resumo_executivo": {
            "total_utilizadores_registados": total_utilizadores,
            "total_logs_forenses_registados": len(logs_acesso),
            "status_sistema": "Operacional e Monitorizado"
        },
        "moderacao_foruns": [
            {"aviso": "Moderação ativa em tempo real"}
        ],
        "forense_telemetria_acessos": logs_acesso
    }

    return dossie

@app.patch("/users/{user_id}/status")
async def alterar_status_utilizador(user_id: int, dados: dict, db: AsyncSession = Depends(database.get_db)):
    result = await db.execute(select(models.User).where(models.User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    
    acao = dados.get("action")
    if acao == "suspend":
        dias = int(dados.get("days", 7))
        user.suspended_until = datetime.utcnow() + timedelta(days=dias)
        user.status = f"Suspenso ({dias}d)"
    elif acao == "unsuspend":
        user.status = "Ativo (BD)"
        user.suspended_until = None
    
    await db.commit()
    await db.refresh(user)
    return {"message": f"Estado atualizado para: {user.status}"}

@app.get("/users/search")
async def pesquisar_utilizador(
    username: str | None = None,
    email: str | None = None,
    db: AsyncSession = Depends(database.get_db),
    utilizador_atual: models.User = Depends(obter_utilizador_atual)
):
    if username:
        result = await db.execute(select(models.User).where(models.User.username == username))
        user = result.scalar_one_or_none()
    elif email:
        result = await db.execute(select(models.User).where(models.User.email == email))
        user = result.scalar_one_or_none()
    else:
        raise HTTPException(status_code=400, detail="Forneça um username ou email para pesquisar.")
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado.")
    
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email
    }

# ==========================================
# MENSAGENS PRIVADAS E COMUNICAÇÃO ADMIN
# ==========================================
@app.get("/messages/my-messages")
async def listar_mensagens_utilizador(current_user: models.User = Depends(obter_utilizador_atual), db: AsyncSession = Depends(database.get_db)):
    try:
        result = await db.execute(
            select(models.PrivateMessage).where(models.PrivateMessage.recipient_username == current_user.username)
        )
        mensagens = result.scalars().all()
        return mensagens
    except Exception:
        return []

@app.post("/messages/send-admin-message")
async def enviar_mensagem_admin(
    recipient_username: str, 
    content: str, 
    db: AsyncSession = Depends(database.get_db)
):
    result = await db.execute(
        select(models.User).where(
            (models.User.username == recipient_username) | (models.User.email == recipient_username)
        )
    )
    destinatario = result.scalar_one_or_none()
    
    if not destinatario:
        raise HTTPException(status_code=404, detail="Destinatário não encontrado.")

    try:
        nova_msg = models.PrivateMessage(
            sender_username="Administrador",
            recipient_username=destinatario.username,
            content=content
        )
        db.add(nova_msg)
        await db.commit()
        return {"message": "Mensagem privada enviada com sucesso!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar mensagem: {str(e)}")

@app.delete("/messages/{message_id}")
async def apagar_mensagem_privada(
    message_id: int, 
    current_user: models.User = Depends(obter_utilizador_atual), 
    db: AsyncSession = Depends(database.get_db)
):
    result = await db.execute(
        select(models.PrivateMessage).where(
            models.PrivateMessage.id == message_id, 
            models.PrivateMessage.recipient_username == current_user.username
        )
    )
    msg = result.scalar_one_or_none()
    
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")
    
    await db.delete(msg)
    await db.commit()
    return {"message": "Mensagem excluída com sucesso!"}