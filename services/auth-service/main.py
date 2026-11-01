# Caminho: auth-service/main.py
import os
import httpx
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
from user_agents import parse
import models, database, schemas

SECRET_KEY = "ludarium_super_secret_key_jwt"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# --- FUNÇÃO AUXILIAR DE GEOLOCALIZAÇÃO EXATA POR IP ---
async def obter_localizacao_por_ip(ip: str) -> str:
    """Consulta uma API de geolocalização baseada no IP para retornar cidade, região e país exatos."""
    if not ip or ip in ["127.0.0.1", "localhost", "::1"] or ip.startswith("192.168.") or ip.startswith("10."):
        return "Rede Local / Localhost (Brasil)"
    
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            response = await client.get(f"https://ipapi.co/{ip}/json/")
            if response.status_code == 200:
                data = response.json()
                if data.get("error"):
                    return f"Brasil / Local (IP: {ip})"
                
                cidade = data.get("city", "Desconhecida")
                regiao = data.get("region", "Desconhecida")
                pais = data.get("country_name", "Brasil")
                return f"{cidade} - {regiao}, {pais}"
    except Exception:
        pass
    
    return f"Brasil / Local (IP: {ip})"

# --- CICLO DE VIDA (LIFESPAN) ASSÍNCRONO GLOBAL ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Criação assíncrona das tabelas e migrações automáticas no arranque
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'Ativo (BD)';"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;"))
        await conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severidade VARCHAR DEFAULT 'BAIXA';"))
        await conn.execute(text("ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS detalhes_payload TEXT;"))
    yield

app = FastAPI(title="Ludarium Auth Service", version="1.4.0", lifespan=lifespan)

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
    return {"message": "Auth Service a funcionar com Telemetria, Dossiê de Cibersegurança e LGPD Opt-In!"}

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

    # Registar o consentimento LGPD Opt-In associado ao novo utilizador
    novo_consentimento = models.UserConsent(
        user_id=novo_utilizador.id,
        analytics_opt_in=user.analytics_opt_in
    )
    db.add(novo_consentimento)
    await db.commit()

    return novo_utilizador

@app.post("/login")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(database.get_db)):
    ip_client = request.headers.get("x-forwarded-for") or (request.client.host if request.client else "127.0.0.1")
    user_agent_string = request.headers.get("user-agent", "")
    parsed_ua = parse(user_agent_string)

    # Obter localização geográfica exata por IP de forma assíncrona
    localizacao_exata = await obter_localizacao_por_ip(ip_client)

    result = await db.execute(
        select(models.User).where((models.User.username == form_data.username) | (models.User.email == form_data.username))
    )
    user = result.scalar_one_or_none()
    
    if not user or not bcrypt.checkpw(form_data.password.encode('utf-8'), user.hashed_password.encode('utf-8')):
        # --- RECOLHA FORENSE DE TENTATIVA DE INVASÃO / BRUTE-FORCE ---
        tipo_disp = "Desconhecido"
        if parsed_ua.is_mobile: tipo_disp = "Telemóvel (Mobile)"
        elif parsed_ua.is_tablet: tipo_disp = "Tablet"
        elif parsed_ua.is_pc: tipo_disp = "Desktop"

        log_intrusao = models.AuditLog(
            user_id=user.id if user else None,
            username=form_data.username,
            ip_address=ip_client,
            user_agent=user_agent_string,
            dispositivo=tipo_disp,
            sistema_operacional=f"{parsed_ua.os.family} {parsed_ua.os.version_string}".strip(),
            navegador=f"{parsed_ua.browser.family} {parsed_ua.browser.version_string}".strip(),
            localizacao=localizacao_exata,
            acao="TENTATIVA_INTRUSAO_FALHA_LOGIN",
            severidade="ALTA",
            detalhes_payload=f"Falha de autenticação para o identificador: {form_data.username}"
        )
        db.add(log_intrusao)
        await db.commit()
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

    # --- RECOLHA DE TELEMETRIA E AUDITORIA FORENSE NO LOGIN COM SUCESSO ---
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
        localizacao=localizacao_exata,
        acao="LOGIN_SUCESSO",
        severidade="BAIXA",
        detalhes_payload="Autenticação efetuada com sucesso."
    )
    db.add(novo_log)
    await db.commit()

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
    
    total_users_res = await db.execute(select(func.count(models.User.id)))
    total_utilizadores = total_users_res.scalar() or 0

    # Contagem de tentativas de intrusão bloqueadas
    intrusao_res = await db.execute(
        select(func.count(models.AuditLog.id)).where(models.AuditLog.severidade.in_(["ALTA", "CRITICA"]))
    )
    tentativas_bloqueadas = intrusao_res.scalar() or 0

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
            "status_sistema": "Operacional e Protegido"
        },
        "moderacao_foruns": [
            {"aviso": "Moderação ativa em tempo real contra ataques e acessos não autorizados"}
        ],
        "forense_telemetria_acessos": logs_acesso,
        "tentativas_intrusao_bloqueadas": tentativas_bloqueadas
    }

    return dossie

# ==========================================
# DOSSIÊ DE CONFORMIDADE LGPD (PAINEL ADMIN)
# ==========================================
@app.get("/api/admin/dossier")
async def obter_dossie_lgpd_admin(db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(obter_utilizador_atual)):
    isAdmin = (current_user.username == 'admin' or current_user.email == 'admin@ludarium.com' or getattr(current_user, 'is_admin', False))
    if not isAdmin:
        raise HTTPException(status_code=403, detail="Acesso restrito exclusivamente a administradores.")

    total_users_res = await db.execute(select(func.count(models.User.id)))
    total_users = total_users_res.scalar() or 0

    opt_in_res = await db.execute(select(func.count(models.UserConsent.user_id)).where(models.UserConsent.analytics_opt_in == True))
    opt_in_count = opt_in_res.scalar() or 0

    opt_rate = round((opt_in_count / total_users * 100), 1) if total_users > 0 else 0.0

    stmt = (
        select(models.User, models.UserConsent)
        .outerjoin(models.UserConsent, models.User.id == models.UserConsent.user_id)
        .order_by(models.User.id.desc())
        .limit(20)
    )
    result = await db.execute(stmt)
    rows = result.all()

    recent_logs = []
    for user, consent in rows:
        recent_logs.append({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "analytics_opt_in": 1 if (consent and consent.analytics_opt_in) else 0,
            "consent_date": consent.consent_date.isoformat() if (consent and consent.consent_date) else "N/A"
        })

    return {
        "kpis": {
            "total_users": total_users,
            "opt_in_count": opt_in_count,
            "opt_rate": opt_rate
        },
        "recent_logs": recent_logs
    }

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

@app.delete("/admin/dossie-forense/limpar")
async def limpar_historico_acessos(db: AsyncSession = Depends(database.get_db), current_user: models.User = Depends(obter_utilizador_atual)):
    # Validação rigorosa de Administrador
    isAdmin = (current_user.username == 'admin' or current_user.email == 'admin@ludarium.com' or getattr(current_user, 'is_admin', False))
    if not isAdmin:
        raise HTTPException(status_code=403, detail="Acesso restrito exclusivamente a administradores.")

    try:
        # Executa a limpeza de todos os registos da tabela de audit_logs
        await db.execute(text("DELETE FROM audit_logs;"))
        await db.commit()
        return {"message": "Histórico de acessos e dossiê forense limpo com sucesso!"}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao limpar histórico forense: {str(e)}")