# Caminho: servico-de-comunidade/main.py
import os
import urllib.parse
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, Query, Body, WebSocket, WebSocketDisconnect
from fastapi.security import OAuth2PasswordBearer
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from sqlalchemy.orm import selectinload

import models
import database
import schemas

SECRET_KEY = "ludarium_super_secret_key_jwt"
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

app = FastAPI(title="Ludarium Community Service", version="1.0.0")

# --- CORS CONFIGURATION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- WEBSOCKET CONNECTION MANAGER ---
class ChatConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_key: str, websocket: WebSocket):
        await websocket.accept()
        if room_key not in self.active_connections:
            self.active_connections[room_key] = []
        self.active_connections[room_key].append(websocket)

    def disconnect(self, room_key: str, websocket: WebSocket):
        if room_key in self.active_connections:
            if websocket in self.active_connections[room_key]:
                self.active_connections[room_key].remove(websocket)
            if not self.active_connections[room_key]:
                del self.active_connections[room_key]

    async def broadcast(self, room_key: str, message: dict):
        if room_key in self.active_connections:
            for connection in self.active_connections[room_key]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ChatConnectionManager()

# --- MIGRAÇÃO E CRIAÇÃO ASSÍNCRONA NO ARRANQUE ---
@app.on_event("startup")
async def startup_event():
    async with database.engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)
        
        migrations = [
            "ALTER TABLE foruns_publicos ADD COLUMN IF NOT EXISTS is_suspended INTEGER DEFAULT 0;",
            "ALTER TABLE foruns_publicos ADD COLUMN IF NOT EXISTS suspend_reason TEXT;",
            "ALTER TABLE foruns_publicos ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMP;",
            "ALTER TABLE foruns_denuncias ADD COLUMN IF NOT EXISTS evidencia TEXT;",
            "ALTER TABLE foruns_denuncias ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pendente';",
            "ALTER TABLE foruns_denuncias ADD COLUMN IF NOT EXISTS gravidade TEXT DEFAULT 'moderada';",
            "ALTER TABLE grupos_privados ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'privado';",
            "ALTER TABLE grupo_membros ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'membro';",
            "ALTER TABLE publicacao_candidatos ADD COLUMN IF NOT EXISTS chat_liberado INTEGER DEFAULT 0;"
        ]
        
        for mig in migrations:
            try:
                await conn.execute(text(mig))
            except Exception as e:
                print(f"Aviso na migração DDL: {e}")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/comunidade-ui", StaticFiles(directory=FRONTEND_DIR), name="frontend")

async def obter_db():
    async for session in database.obter_base_de_dados():
        yield session

def obter_utilizador_atual(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar as credenciais de autenticação",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub") or payload.get("email")
        if email is None:
            raise credentials_exception
        return email
    except JWTError:
        raise credentials_exception

async def criar_notificacao_aux(db: AsyncSession, destinatario_email: str, conteudo: str):
    if not destinatario_email:
        return
    nova_notif = models.NotificationModel(
        user_id=destinatario_email,
        content=conteudo,
        is_read=0
    )
    db.add(nova_notif)

# --- WEBSOCKET ENDPOINTS EM TEMPO REAL ---

@app.websocket("/ws/forum/{forum_id}")
async def ws_forum_endpoint(
    websocket: WebSocket, 
    forum_id: int, 
    token: str = Query(...)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub") or payload.get("email")
        if not email:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    room_key = f"forum_{forum_id}"
    await manager.connect(room_key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("tipo") == "digitando":
                await manager.broadcast(room_key, {
                    "tipo": "digitando",
                    "autor": data.get("autor", email.split('@')[0])
                })
                continue

            conteudo = data.get("conteudo")
            autor = data.get("autor") or email.split('@')[0]
            if conteudo:
                async for session in database.obter_base_de_dados():
                    topico_res = await session.execute(select(models.ForumTopicoModel).filter(models.ForumTopicoModel.forum_id == forum_id))
                    topico = topico_res.scalars().first()
                    if topico:
                        nova_msg = models.ForumTopicoMensagemModel(
                            topico_id=topico.id,
                            conteudo=conteudo.strip(),
                            autor=autor,
                            autor_email=email
                        )
                        session.add(nova_msg)
                        await session.commit()
                        await session.refresh(nova_msg)
                        data["id"] = nova_msg.id
                        data["created_at"] = str(nova_msg.created_at)
                    break
            await manager.broadcast(room_key, data)
    except WebSocketDisconnect:
        manager.disconnect(room_key, websocket)

@app.websocket("/ws/candidatura/{candidatura_id}")
async def ws_candidatura_endpoint(websocket: WebSocket, candidatura_id: int):
    room_key = f"candidatura_{candidatura_id}"
    await manager.connect(room_key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("tipo") == "digitando":
                await manager.broadcast(room_key, {
                    "tipo": "digitando",
                    "autor": data.get("autor", "Utilizador")
                })
                continue

            conteudo = data.get("conteudo")
            autor_email = data.get("autor_email")
            autor = data.get("autor")
            
            if conteudo:
                async for session in database.obter_base_de_dados():
                    nova_mensagem = models.CandidaturaMensagemModel(
                        candidatura_id=candidatura_id,
                        autor=autor or "Utilizador",
                        autor_email=autor_email or "sistema@ludarium.com",
                        conteudo=conteudo.strip()
                    )
                    session.add(nova_mensagem)
                    await session.commit()
                    await session.refresh(nova_mensagem)
                    
                    data["id"] = nova_mensagem.id
                    data["created_at"] = str(nova_mensagem.created_at)
                    break

            await manager.broadcast(room_key, data)
    except WebSocketDisconnect:
        manager.disconnect(room_key, websocket)

@app.websocket("/ws/grupo/{grupo_id}")
async def ws_grupo_endpoint(
    websocket: WebSocket, 
    grupo_id: int, 
    token: str = Query(...)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub") or payload.get("email")
        if not email:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    room_key = f"grupo_{grupo_id}"
    await manager.connect(room_key, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("tipo") == "digitando":
                await manager.broadcast(room_key, {
                    "tipo": "digitando",
                    "autor": data.get("autor", email.split('@')[0])
                })
                continue

            conteudo = data.get("conteudo")
            autor = data.get("autor") or email.split('@')[0]
            if conteudo:
                async for session in database.obter_base_de_dados():
                    nova_msg = models.GrupoMensagemModel(
                        grupo_id=grupo_id,
                        autor=autor,
                        autor_email=email,
                        conteudo=conteudo.strip()
                    )
                    session.add(nova_msg)
                    await session.commit()
                    await session.refresh(nova_msg)
                    data["id"] = nova_msg.id
                    data["created_at"] = str(nova_msg.created_at)
                    break
            await manager.broadcast(room_key, data)
    except WebSocketDisconnect:
        manager.disconnect(room_key, websocket)

@app.get("/")
def raiz():
    return {"mensagem": "Serviço de Comunidade assíncrono compatível com Cloudflare, WebSockets e JWT funcional!"}

@app.get("/publicacoes", response_model=list[schemas.PublicacaoResponse])
async def listar_publicacoes(db: AsyncSession = Depends(obter_db)):
    result = await db.execute(
        select(models.PublicacaoModel)
        .options(selectinload(models.PublicacaoModel.comentarios))
    )
    publicacoes = result.scalars().all()
    
    if not publicacoes:
        pub1 = models.PublicacaoModel(
            autor="Caio Martins",
            autor_arroba="@caiomakes",
            creator_email="caio@ludarium.com",
            comunidade="Dev Indie Brasil",
            tipo_badge="PROCURANDO EQUIPE",
            titulo="Precisamos de uma artista 2D para uma game jam de 10 dias",
            conteudo="Somos três pessoas trabalhando em um jogo de exploração sobre memórias. Já temos programação, música e narrativa. Procuramos alguém que goste de pixel art com paleta limitada.",
            tags="godot,pixel art,remoto",
            votos=12,
            interessados_qtd=0,
            favorito=0
        )
        db.add(pub1)
        await db.commit()
        await db.refresh(pub1)
        
        result = await db.execute(
            select(models.PublicacaoModel)
            .options(selectinload(models.PublicacaoModel.comentarios))
        )
        publicacoes = result.scalars().all()

    resultado = []
    for p in publicacoes:
        tags_lista = [t.strip() for t in (p.tags or "").split(",") if t.strip()]
        comentarios_formatados = [
            {
                "id": c.id,
                "publicacao_id": c.publicacao_id,
                "autor": c.autor,
                "autor_arroba": c.autor_arroba,
                "conteudo": c.conteudo
            } for c in (p.comentarios or [])
        ]
        resultado.append({
            "id": p.id,
            "autor": p.autor,
            "autor_arroba": p.autor_arroba,
            "comunidade": p.comunidade,
            "tipo_badge": p.tipo_badge,
            "titulo": p.titulo,
            "conteudo": p.conteudo,
            "tags": tags_lista,
            "votos": p.votos,
            "comentarios_qtd": len(comentarios_formatados),
            "interessados_qtd": p.interessados_qtd,
            "favorito": p.favorito,
            "comentarios": comentarios_formatados
        })
    return resultado

@app.post("/publicacoes", response_model=schemas.PublicacaoResponse, status_code=status.HTTP_201_CREATED)
async def criar_publicacao(pub: schemas.PublicacaoCreate, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    nome_utilizador = utilizador_email.split('@')[0]
    tags_str = ",".join(pub.tags)
    
    nova_pub = models.PublicacaoModel(
        autor=nome_utilizador,
        autor_arroba=f"@{nome_utilizador}",
        creator_email=utilizador_email,
        comunidade=pub.comunidade,
        tipo_badge=pub.tipo_badge,
        titulo=pub.titulo,
        conteudo=pub.conteudo,
        tags=tags_str,
        votos=0,
        interessados_qtd=0,
        favorito=0
    )
    db.add(nova_pub)
    await db.commit()
    await db.refresh(nova_pub)
    
    return {
        "id": nova_pub.id,
        "autor": nova_pub.autor,
        "autor_arroba": nova_pub.autor_arroba,
        "comunidade": nova_pub.comunidade,
        "tipo_badge": nova_pub.tipo_badge,
        "titulo": nova_pub.titulo,
        "conteudo": nova_pub.conteudo,
        "tags": pub.tags,
        "votos": nova_pub.votos,
        "comentarios_qtd": 0,
        "interessados_qtd": nova_pub.interessados_qtd,
        "favorito": nova_pub.favorito,
        "comentarios": []
    }

@app.post("/publicacoes/{publicacao_id}/comentarios", response_model=schemas.ComentarioResponse, status_code=status.HTTP_201_CREATED)
async def adicionar_comentario(publicacao_id: int, comentario: schemas.ComentarioCreate, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    result = await db.execute(select(models.PublicacaoModel).filter(models.PublicacaoModel.id == publicacao_id))
    pub = result.scalars().first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publicação não encontrada")
    
    nome_utilizador = utilizador_email.split('@')[0]
    novo_comentario = models.ComentarioModel(
        publicacao_id=publicacao_id,
        autor=nome_utilizador,
        autor_arroba=f"@{nome_utilizador}",
        conteudo=comentario.conteudo
    )
    db.add(novo_comentario)

    if pub.creator_email and pub.creator_email != utilizador_email:
        await criar_notificacao_aux(
            db, 
            pub.creator_email, 
            f"@{nome_utilizador} comentou na sua publicação: '{pub.titulo[:30]}...'"
        )

    await db.commit()
    await db.refresh(novo_comentario)
    return novo_comentario

@app.patch("/publicacoes/{publicacao_id}/participar", response_model=schemas.PublicacaoResponse)
async def quero_participar(publicacao_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    result = await db.execute(
        select(models.PublicacaoModel)
        .options(selectinload(models.PublicacaoModel.comentarios))
        .filter(models.PublicacaoModel.id == publicacao_id)
    )
    pub = result.scalars().first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publicação não encontrada")
    
    if pub.creator_email and pub.creator_email.strip().lower() == utilizador_email.strip().lower():
        raise HTTPException(status_code=400, detail="O criador da publicação (recrutador) não pode candidatar-se à sua própria vaga.")
    
    nome_utilizador = utilizador_email.split('@')[0]

    try:
        reg_res = await db.execute(select(models.PublicacaoInteressadoModel).filter_by(publicacao_id=publicacao_id, user_email=utilizador_email))
        registo = reg_res.scalars().first()
        
        cand_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(publicacao_id=publicacao_id, user_email=utilizador_email))
        candidato_reg = cand_res.scalars().first()

        if registo:
            await db.delete(registo)
            if candidato_reg:
                await db.delete(candidato_reg)
            pub.interessados_qtd = max(0, (pub.interessados_qtd or 0) - 1)
        else:
            novo_registo = models.PublicacaoInteressadoModel(publicacao_id=publicacao_id, user_email=utilizador_email)
            db.add(novo_registo)
            
            if not candidato_reg:
                novo_candidato = models.PublicacaoCandidatoModel(
                    publicacao_id=publicacao_id,
                    user_email=utilizador_email,
                    nome=nome_utilizador,
                    username=f"@{nome_utilizador}",
                    papel=f"Candidato para: {pub.titulo[:20]}...",
                    status="pendente",
                    chat_liberado=0
                )
                db.add(novo_candidato)

            pub.interessados_qtd = (pub.interessados_qtd or 0) + 1

            if pub.creator_email:
                await criar_notificacao_aux(
                    db, 
                    pub.creator_email, 
                    f"@{nome_utilizador} candidatou-se à sua publicação: '{pub.titulo[:30]}...'"
                )

        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar a participação: {str(e)}")
    
    result_final = await db.execute(
        select(models.PublicacaoModel)
        .options(selectinload(models.PublicacaoModel.comentarios))
        .filter(models.PublicacaoModel.id == publicacao_id)
    )
    pub_atualizada = result_final.scalars().first()
    
    tags_lista = [t.strip() for t in (pub_atualizada.tags or "").split(",") if t.strip()]
    comentarios_formatados = [
        {"id": c.id, "publicacao_id": c.publicacao_id, "autor": c.autor, "autor_arroba": c.autor_arroba, "conteudo": c.conteudo} 
        for c in (pub_atualizada.comentarios or [])
    ]
    
    return {
        "id": pub_atualizada.id,
        "autor": pub_atualizada.autor,
        "autor_arroba": pub_atualizada.autor_arroba,
        "creator_email": pub_atualizada.creator_email,
        "comunidade": pub_atualizada.comunidade,
        "tipo_badge": pub_atualizada.tipo_badge,
        "titulo": pub_atualizada.titulo,
        "conteudo": pub_atualizada.conteudo,
        "tags": tags_lista,
        "votos": pub_atualizada.votos,
        "comentarios_qtd": len(comentarios_formatados),
        "interessados_qtd": pub_atualizada.interessados_qtd,
        "favorito": pub_atualizada.favorito,
        "comentarios": comentarios_formatados
    }

@app.get("/publicacoes/{publicacao_id}/candidatos")
async def listar_candidatos_publicacao(publicacao_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    email_atual = utilizador_email.strip().lower()
    
    result = await db.execute(select(models.PublicacaoModel).filter(models.PublicacaoModel.id == publicacao_id))
    pub = result.scalars().first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publicação não encontrada.")

    creator_email = (pub.creator_email or "").strip().lower()
    is_criador = bool(creator_email and creator_email == email_atual)
    is_admin = "admin" in email_atual
    
    if is_criador or is_admin:
        candidatos_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(publicacao_id=publicacao_id))
        candidatos = candidatos_res.scalars().all()
        
        recrutador_nome_oficial = pub.autor or (creator_email.split('@')[0] if creator_email else "Recrutador")
        resultado = []
        for c in candidatos:
            resultado.append({
                "id": c.id,
                "publicacao_id": c.publicacao_id,
                "user_email": c.user_email,
                "nome": c.nome,
                "username": c.username,
                "papel": c.papel,
                "status": c.status,
                "chat_liberado": getattr(c, "chat_liberado", 1),
                "recrutador_nome": recrutador_nome_oficial
            })
        return resultado

    cand_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(
        publicacao_id=publicacao_id, 
        user_email=utilizador_email
    ))
    candidato_inscrito = cand_res.scalars().first()
    if candidato_inscrito:
        return [{
            "id": candidato_inscrito.id,
            "publicacao_id": candidato_inscrito.publicacao_id,
            "user_email": candidato_inscrito.user_email,
            "nome": candidato_inscrito.nome,
            "username": candidato_inscrito.username,
            "papel": candidato_inscrito.papel,
            "status": candidato_inscrito.status,
            "chat_liberado": candidato_inscrito.chat_liberado,
            "recrutador_nome": pub.autor or "Recrutador"
        }]
    
    return []

@app.patch("/candidatos/{candidato_id}/status")
async def atualizar_status_candidato(candidato_id: int, payload: dict = Body(...), db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    novo_status = payload.get("status")
    if novo_status not in ["pendente", "aprovado", "reprovado"]:
        raise HTTPException(status_code=400, detail="Status inválido. Use 'pendente', 'aprovado' ou 'reprovado'.")
    
    cand_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(id=candidato_id))
    candidato = cand_res.scalars().first()
    if not candidato:
        raise HTTPException(status_code=404, detail="Candidato não encontrado.")
    
    pub_res = await db.execute(select(models.PublicacaoModel).filter(models.PublicacaoModel.id == candidato.publicacao_id))
    pub = pub_res.scalars().first()
    is_admin = "admin" in utilizador_email.lower()
    if pub and pub.creator_email and pub.creator_email.lower() != utilizador_email.lower() and not is_admin:
        raise HTTPException(status_code=403, detail="Apenas o criador da publicação pode alterar o status do candidato.")
    
    candidato.status = novo_status
    if novo_status == "aprovado":
        candidato.chat_liberado = 1

    await db.commit()
    
    await criar_notificacao_aux(
        db,
        candidato.user_email,
        f"📢 O seu status de candidatura para '{pub.titulo if pub else 'a vaga'}' foi atualizado para: {novo_status.upper()}."
    )
    await db.commit()
    
    return {"mensagem": f"Candidato atualizado para {novo_status} com sucesso!", "id": candidato.id, "status": candidato.status, "chat_liberado": candidato.chat_liberado}

@app.delete("/candidatos/{candidato_id}", status_code=status.HTTP_204_NO_CONTENT)
async def apagar_candidato_base(candidato_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    cand_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(id=candidato_id))
    candidato = cand_res.scalars().first()
    if not candidato:
        raise HTTPException(status_code=404, detail="Candidato não encontrado.")
    
    pub_res = await db.execute(select(models.PublicacaoModel).filter(models.PublicacaoModel.id == candidato.publicacao_id))
    pub = pub_res.scalars().first()
    is_admin = "admin" in utilizador_email.lower()
    
    eh_criador_vaga = pub and pub.creator_email and pub.creator_email.lower() == utilizador_email.lower()
    eh_proprio_candidato = candidato.user_email.lower() == utilizador_email.lower()
    
    if not eh_criador_vaga and not eh_proprio_candidato and not is_admin:
        raise HTTPException(status_code=403, detail="Sem permissão para apagar este candidato.")
    
    msgs_res = await db.execute(select(models.CandidaturaMensagemModel).filter_by(candidatura_id=candidato_id))
    for msg in msgs_res.scalars().all():
        await db.delete(msg)
    
    await db.delete(candidato)
    await db.commit()
    return None 

@app.get("/oportunidades")
async def listar_oportunidades(db: AsyncSession = Depends(obter_db)):
    return [
        {"id": 1, "titulo": "Artista 2D para game jam", "contexto": "Remoto • 10 dias", "tags": ["pixel art", "godot"], "interessados_qtd": 3},
        {"id": 2, "titulo": "Testadores para demo narrativa", "contexto": "Flexível • Voluntário", "tags": ["narrative", "py"], "interessados_qtd": 8},
        {"id": 3, "titulo": "Compositor para jogo de terror", "contexto": "Remoto • Revenue share", "tags": ["audio", "unity"], "interessados_qtd": 2}
    ]

@app.get("/recomendados/skills")
async def listar_perfis_recomendados(db: AsyncSession = Depends(obter_db)):
    return [
        {"id": 1, "nome": "Marina Costa", "papel": "Artista 3D • Blender", "compatibilidade_porcentagem": 92},
        {"id": 2, "nome": "Rafael Lima", "papel": "Programador • Godot", "compatibilidade_porcentagem": 87},
        {"id": 3, "nome": "Yasmin Alves", "papel": "UI/UX Designer", "compatibilidade_porcentagem": 81}
    ]

@app.get("/candidaturas/{candidatura_id}/mensagens")
async def listar_mensagens_candidatura(
    candidatura_id: int, 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    email_atual = utilizador_email.strip().lower()

    cand_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(id=candidatura_id))
    candidato = cand_res.scalars().first()
    
    if not candidato:
        raise HTTPException(status_code=404, detail="Candidatura não encontrada.")

    pub_res = await db.execute(select(models.PublicacaoModel).filter_by(id=candidato.publicacao_id))
    pub_obj = pub_res.scalars().first()

    is_recrutador = pub_obj and pub_obj.creator_email and pub_obj.creator_email.strip().lower() == email_atual
    is_candidato = candidato.user_email and candidato.user_email.strip().lower() == email_atual
    is_admin = "admin" in email_atual
    
    if not (is_recrutador or is_candidato or is_admin):
        raise HTTPException(status_code=403, detail="Acesso negado ao chat.")

    if candidato and getattr(candidato, 'chat_liberado', 0) == 0:
        candidato.chat_liberado = 1
        await db.commit()

    msg_res = await db.execute(
        select(models.CandidaturaMensagemModel)
        .filter_by(candidatura_id=candidatura_id)
        .order_by(models.CandidaturaMensagemModel.id.asc())
    )
    mensagens_db = msg_res.scalars().all()
    
    resultado = []
    for m in mensagens_db:
        resultado.append({
            "id": m.id,
            "candidatura_id": candidatura_id,
            "autor": m.autor,
            "autor_email": m.autor_email,
            "conteudo": m.conteudo,
            "created_at": m.created_at
        })
        
    return resultado

@app.post("/candidaturas/{candidatura_id}/mensagens")
async def enviar_mensagem_candidatura(
    candidatura_id: int,
    payload: schemas.MensagemCreateSchema,
    db: AsyncSession = Depends(obter_db),
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    email_atual = utilizador_email.strip().lower()

    cand_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(id=candidatura_id))
    candidato = cand_res.scalars().first()
    if not candidato:
        raise HTTPException(status_code=404, detail="Candidatura não encontrada.")

    pub_res = await db.execute(select(models.PublicacaoModel).filter_by(id=candidato.publicacao_id))
    pub_obj = pub_res.scalars().first()

    is_recrutador = pub_obj and pub_obj.creator_email and pub_obj.creator_email.strip().lower() == email_atual
    is_candidato = candidato.user_email and candidato.user_email.strip().lower() == email_atual
    is_admin = "admin" in email_atual

    if not (is_recrutador or is_candidato or is_admin):
        raise HTTPException(status_code=403, detail="Não tem permissão para enviar mensagens nesta candidatura.")

    if getattr(candidato, 'chat_liberado', 0) == 0:
        candidato.chat_liberado = 1

    nome_autor = email_atual.split('@')[0]
    nova_msg = models.CandidaturaMensagemModel(
        candidatura_id=candidatura_id,
        autor=nome_autor,
        autor_email=email_atual,
        conteudo=payload.conteudo
    )
    
    db.add(nova_msg)
    await db.commit()
    await db.refresh(nova_msg)

    return {
        "id": nova_msg.id,
        "candidatura_id": candidatura_id,
        "autor": nova_msg.autor,
        "autor_email": nova_msg.autor_email,
        "conteudo": nova_msg.conteudo,
        "created_at": nova_msg.created_at
    }

@app.get("/meus-chats-candidaturas")
async def listar_meus_chats_candidaturas(db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    cand_res = await db.execute(select(models.PublicacaoCandidatoModel).filter_by(user_email=utilizador_email))
    candidaturas = cand_res.scalars().all()
    
    resultado = []
    for c in candidaturas:
        pub_res = await db.execute(select(models.PublicacaoModel).filter_by(id=c.publicacao_id))
        pub = pub_res.scalars().first()
        resultado.append({
            "id": c.id,                    
            "candidatura_id": c.id,      
            "publicacao_id": c.publicacao_id,
            "titulo_vaga": pub.titulo if pub else "Vaga",
            "recrutador": pub.autor if pub else "Recrutador",
            "recrutador_email": pub.creator_email if pub else "",
            "status": c.status,
            "papel": c.papel,
            "chat_liberado": getattr(c, "chat_liberado", 0)
        })
    return resultado

@app.patch("/publicacoes/{publicacao_id}/votar", response_model=schemas.PublicacaoResponse)
async def votar_publicacao(publicacao_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    result = await db.execute(
        select(models.PublicacaoModel)
        .options(selectinload(models.PublicacaoModel.comentarios))
        .filter(models.PublicacaoModel.id == publicacao_id)
    )
    pub = result.scalars().first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publicação não encontrada")
    
    voto_res = await db.execute(select(models.PublicacaoVotoModel).filter_by(publicacao_id=publicacao_id, user_email=utilizador_email))
    registo = voto_res.scalars().first()
    nome_utilizador = utilizador_email.split('@')[0]

    if registo:
        await db.delete(registo)
        pub.votos = max(0, pub.votos - 1)
    else:
        novo_registo = models.PublicacaoVotoModel(publicacao_id=publicacao_id, user_email=utilizador_email)
        db.add(novo_registo)
        pub.votos += 1

        if pub.creator_email and pub.creator_email != utilizador_email:
            await criar_notificacao_aux(
                db, 
                pub.creator_email, 
                f"@{nome_utilizador} votou na sua publicação: '{pub.titulo[:30]}...'"
            )

    await db.commit()
    
    result_final = await db.execute(
        select(models.PublicacaoModel)
        .options(selectinload(models.PublicacaoModel.comentarios))
        .filter(models.PublicacaoModel.id == publicacao_id)
    )
    pub_atualizada = result_final.scalars().first()
    
    tags_lista = [t.strip() for t in (pub_atualizada.tags or "").split(",") if t.strip()]
    comentarios_formatados = [
        {
            "id": c.id,
            "publicacao_id": c.publicacao_id,
            "autor": c.autor,
            "autor_arroba": c.autor_arroba,
            "conteudo": c.conteudo
        } for c in (pub_atualizada.comentarios or [])
    ]
    
    return {
        "id": pub_atualizada.id,
        "autor": pub_atualizada.autor,
        "autor_arroba": pub_atualizada.autor_arroba,
        "comunidade": pub_atualizada.comunidade,
        "tipo_badge": pub_atualizada.tipo_badge,
        "titulo": pub_atualizada.titulo,
        "conteudo": pub_atualizada.conteudo,
        "tags": tags_lista,
        "votos": pub_atualizada.votos,
        "comentarios_qtd": len(comentarios_formatados),
        "interessados_qtd": pub_atualizada.interessados_qtd,
        "favorito": pub_atualizada.favorito,
        "comentarios": comentarios_formatados
    }

@app.patch("/publicacoes/{publicacao_id}/favorito", response_model=schemas.PublicacaoResponse)
async def alternar_favorito(publicacao_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    result = await db.execute(
        select(models.PublicacaoModel)
        .options(selectinload(models.PublicacaoModel.comentarios))
        .filter(models.PublicacaoModel.id == publicacao_id)
    )
    pub = result.scalars().first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publicação não encontrada")
    
    reg_res = await db.execute(select(models.PublicacaoFavoritoModel).filter_by(publicacao_id=publicacao_id, user_email=utilizador_email))
    registo = reg_res.scalars().first()
    nome_utilizador = utilizador_email.split('@')[0]

    if registo:
        await db.delete(registo)
        pub.favorito = 0
    else:
        novo_registo = models.PublicacaoFavoritoModel(publicacao_id=publicacao_id, user_email=utilizador_email)
        db.add(novo_registo)
        pub.favorito = 1

        if pub.creator_email and pub.creator_email != utilizador_email:
            await criar_notificacao_aux(
                db, 
                pub.creator_email, 
                f"@{nome_utilizador} adicionou aos favoritos a sua publicação: '{pub.titulo[:30]}...'"
            )

    await db.commit()
    
    result_final = await db.execute(
        select(models.PublicacaoModel)
        .options(selectinload(models.PublicacaoModel.comentarios))
        .filter(models.PublicacaoModel.id == publicacao_id)
    )
    pub_atualizada = result_final.scalars().first()
    
    tags_lista = [t.strip() for t in (pub_atualizada.tags or "").split(",") if t.strip()]
    comentarios_formatados = [
        {"id": c.id, "publicacao_id": c.publicacao_id, "autor": c.autor, "autor_arroba": c.autor_arroba, "conteudo": c.conteudo} 
        for c in (pub_atualizada.comentarios or [])
    ]
    
    return {
        "id": pub_atualizada.id,
        "autor": pub_atualizada.autor,
        "autor_arroba": pub_atualizada.autor_arroba,
        "comunidade": pub_atualizada.comunidade,
        "tipo_badge": pub_atualizada.tipo_badge,
        "titulo": pub_atualizada.titulo,
        "conteudo": pub_atualizada.conteudo,
        "tags": tags_lista,
        "votos": pub_atualizada.votos,
        "comentarios_qtd": len(comentarios_formatados),
        "interessados_qtd": pub_atualizada.interessados_qtd,
        "favorito": pub_atualizada.favorito,
        "comentarios": comentarios_formatados
    }

@app.delete("/publicacoes/{publicacao_id}", status_code=status.HTTP_204_NO_CONTENT)
async def apagar_publicacao(publicacao_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    pub_res = await db.execute(select(models.PublicacaoModel).filter(models.PublicacaoModel.id == publicacao_id))
    pub = pub_res.scalars().first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publicação não encontrada")
    
    nome_utilizador = utilizador_email.split('@')[0]
    is_admin = "admin" in utilizador_email.lower()
    if pub.autor != nome_utilizador and not is_admin:
        raise HTTPException(status_code=403, detail="Não tem permissão para apagar esta publicação")
    
    await db.delete(pub)
    await db.commit()
    return None

@app.delete("/comentarios/{comentario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def apagar_comentario(comentario_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    com_res = await db.execute(select(models.ComentarioModel).filter(models.ComentarioModel.id == comentario_id))
    com = com_res.scalars().first()
    if not com:
        raise HTTPException(status_code=404, detail="Comentário não encontrado")
    
    nome_utilizador = utilizador_email.split('@')[0]
    is_admin = "admin" in utilizador_email.lower()
    if com.autor != nome_utilizador and not is_admin:
        raise HTTPException(status_code=403, detail="Não tem permissão para apagar este comentário")
    
    await db.delete(com)
    await db.commit()
    return None

@app.put("/publicacoes/{publicacao_id}", response_model=schemas.PublicacaoResponse)
async def editar_publicacao(publicacao_id: int, dados: schemas.PublicacaoCreate, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    pub_res = await db.execute(select(models.PublicacaoModel).filter(models.PublicacaoModel.id == publicacao_id))
    pub = pub_res.scalars().first()
    if not pub:
        raise HTTPException(status_code=404, detail="Publicação não encontrada")
    
    nome_utilizador = utilizador_email.split('@')[0]
    is_admin = "admin" in utilizador_email.lower()
    if pub.autor != nome_utilizador and not is_admin:
        raise HTTPException(status_code=403, detail="Sem permissão para editar esta publicação")
    
    pub.titulo = dados.titulo
    pub.conteudo = dados.conteudo
    pub.comunidade = dados.comunidade
    pub.tipo_badge = dados.tipo_badge
    pub.tags = ",".join(dados.tags)
    
    await db.commit()
    await db.refresh(pub)
    
    tags_lista = [t.strip() for t in pub.tags.split(",") if t.strip()]
    comentarios_formatados = [
        {
            "id": c.id,
            "publicacao_id": c.publicacao_id,
            "autor": c.autor,
            "autor_arroba": c.autor_arroba,
            "conteudo": c.conteudo
        } for c in pub.comentarios
    ]
    
    return {
        "id": pub.id,
        "autor": pub.autor,
        "autor_arroba": pub.autor_arroba,
        "comunidade": pub.comunidade,
        "tipo_badge": pub.tipo_badge,
        "titulo": pub.titulo,
        "conteudo": pub.conteudo,
        "tags": tags_lista,
        "votos": pub.votos,
        "comentarios_qtd": len(comentarios_formatados),
        "interessados_qtd": pub.interessados_qtd,
        "favorito": pub.favorito,
        "comentarios": comentarios_formatados
    }

@app.get("/messages/my-messages")
async def listar_mensagens_privadas(db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    msg_res = await db.execute(select(models.MessageModel).filter(models.MessageModel.recipient_email == utilizador_email))
    mensagens = msg_res.scalars().all()
    
    if not mensagens:
        msg_inicial = models.MessageModel(
            sender_username="Administração Ludarium",
            recipient_email=utilizador_email,
            content="Bem-vindo ao sistema de microsserviços do Ludarium! Verifique as diretrizes da comunidade.",
            created_at="2026-10-22T10:00:00Z"
        )
        db.add(msg_inicial)
        await db.commit()
        await db.refresh(msg_inicial)
        mensagens = [msg_inicial]
    return mensagens

@app.post("/messages/send-admin-message")
async def enviar_mensagem_admin(
    recipient_username: str = Query(None), 
    content: str = Query(None),
    payload: dict = Body(default=None),
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    destinatario = recipient_username
    mensagem = content

    if payload:
        if not destinatario:
            destinatario = payload.get("recipient_username") or payload.get("recipient")
        if not mensagem:
            mensagem = payload.get("content") or payload.get("message")

    if not destinatario or not mensagem:
        raise HTTPException(status_code=422, detail="recipient_username e content são obrigatórios.")

    nova_msg = models.MessageModel(
        sender_username=utilizador_email.split('@')[0],
        recipient_email=destinatario,
        content=mensagem,
        created_at=datetime.utcnow().isoformat() + "Z"
    )
    db.add(nova_msg)
    await db.commit()
    await db.refresh(nova_msg)
    return {"mensagem": "Mensagem privada enviada com sucesso!", "id": nova_msg.id}

@app.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def apagar_mensagem(
    message_id: int, 
    db: AsyncSession = Depends(obter_db),
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    msg_res = await db.execute(select(models.MessageModel).filter(models.MessageModel.id == message_id))
    mensagem = msg_res.scalars().first()
    if not mensagem:
        return None
    await db.delete(mensagem)
    await db.commit()
    return None

@app.get("/notifications", response_model=list[schemas.NotificationResponse])
async def listar_notificacoes(db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    notif_res = await db.execute(
        select(models.NotificationModel)
        .filter(models.NotificationModel.user_id == utilizador_email)
        .order_by(models.NotificationModel.created_at.desc())
    )
    return notif_res.scalars().all()

@app.patch("/notifications/{notification_id}/read")
async def marcar_notificacao_lida(notification_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    notif_res = await db.execute(select(models.NotificationModel).filter(
        models.NotificationModel.id == notification_id,
        models.NotificationModel.user_id == utilizador_email
    ))
    notificacao = notif_res.scalars().first()
    
    if not notificacao:
        raise HTTPException(status_code=404, detail="Notificação não encontrada.")
    
    notificacao.is_read = 1
    await db.commit()
    return {"message": "Notificação marcada como lida com sucesso!"}    

@app.post("/notifications", status_code=status.HTTP_201_CREATED)
async def criar_notificacao_automatica(
    destinatario_email: str,
    conteudo: str,
    link_destino: str | None = None,
    db: AsyncSession = Depends(obter_db)
):
    nova_notificacao = models.NotificationModel(
        user_id=destinatario_email,
        content=conteudo,
        link=link_destino,
        is_read=0
    )
    db.add(nova_notificacao)
    await db.commit()
    await db.refresh(nova_notificacao)
    
    return {
        "mensagem": "Notificação criada com sucesso!",
        "id": nova_notificacao.id
    }

@app.get("/foruns", response_model=list[schemas.ForumResponse])
async def listar_foruns(db: AsyncSession = Depends(obter_db)):
    now = datetime.utcnow()
    forum_res = await db.execute(select(models.ForumModel).filter(
        models.ForumModel.is_suspended == 1,
        models.ForumModel.suspended_until != None
    ))
    foruns_com_prazo = forum_res.scalars().all()
    
    for f in foruns_com_prazo:
        if f.suspended_until and f.suspended_until <= now:
            f.is_suspended = 0
            f.suspend_reason = None
            f.suspended_until = None
    await db.commit()

    all_foruns_res = await db.execute(select(models.ForumModel))
    foruns = all_foruns_res.scalars().all()
    if not foruns:
        forum_padrao = models.ForumModel(
            titulo="Game Design Geral",
            descricao="Discussões gerais sobre mecânicas, balanceamento e design de jogos indie.",
            categoria="Game Design",
            creator_email="admin@ludarium.com"
        )
        db.add(forum_padrao)
        await db.commit()
        await db.refresh(forum_padrao)
        
        topico_padrao = models.ForumTopicoModel(
            forum_id=forum_padrao.id,
            titulo="Bem-vindos ao fórum de Game Design Geral!",
            conteudo="Tópico inicial de boas-vindas.",  
            autor="admin",
            autor_email="admin@ludarium.com"
        )
        db.add(topico_padrao)
        await db.commit()
        await db.refresh(topico_padrao)
        
        msg_padrao = models.ForumTopicoMensagemModel(
            topico_id=topico_padrao.id,
            conteudo="Debatam aqui sobre game design.",
            autor="admin",
            autor_email="admin@ludarium.com"
        )
        db.add(msg_padrao)
        await db.commit()
        foruns = [forum_padrao]
    return foruns

@app.post("/foruns", response_model=schemas.ForumResponse, status_code=status.HTTP_201_CREATED)
async def criar_forum(forum: schemas.ForumCreate, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    novo_forum = models.ForumModel(
        titulo=forum.titulo,
        descricao=forum.descricao,
        categoria=forum.categoria,
        creator_email=utilizador_email
    )
    db.add(novo_forum)
    await db.commit()
    await db.refresh(novo_forum)

    topico_inicial = models.ForumTopicoModel(
        forum_id=novo_forum.id,
        titulo=f"Discussão Geral - {forum.titulo}",
        conteudo="Tópico criado automaticamente.",
        autor=utilizador_email.split('@')[0],
        autor_email=utilizador_email
    )
    db.add(topico_inicial)
    await db.commit()

    return novo_forum

@app.delete("/foruns/{forum_id}", status_code=status.HTTP_204_NO_CONTENT)
async def apagar_forum(forum_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == forum_id))
    forum = forum_res.scalars().first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    
    is_admin = "admin" in utilizador_email.lower()
    is_creator = forum.creator_email == utilizador_email or forum.creator_email.split('@')[0] == utilizador_email.split('@')[0]
    
    if getattr(forum, "is_suspended", 0) == 1 and not is_admin:
        raise HTTPException(status_code=403, detail="Este fórum foi banido pela administração. O criador não tem autoridade para removê-lo.")

    if not is_creator and not is_admin:
        raise HTTPException(status_code=403, detail="Não tem permissão para apagar este fórum")
    
    await db.delete(forum)
    await db.commit()
    return None

@app.patch("/admin/foruns/{forum_id}/suspender", status_code=status.HTTP_200_OK)
async def suspender_forum_admin(
    forum_id: int, 
    payload: dict = Body(default=None),
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    is_admin = "admin" in utilizador_email.lower()
    if not is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")
    
    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == forum_id))
    forum = forum_res.scalars().first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    
    motivo = "Violação das diretrizes da comunidade."
    horas = 72
    if payload:
        if "motivo" in payload and payload["motivo"].strip():
            motivo = payload["motivo"].strip()
        if "horas_suspensao" in payload:
            try:
                horas = int(payload["horas_suspensao"])
            except ValueError:
                pass

    suspended_until = datetime.utcnow() + timedelta(hours=horas)

    forum.is_suspended = 1
    forum.suspend_reason = motivo
    forum.suspended_until = suspended_until
    await db.commit()
    await db.refresh(forum)
    
    return {"mensagem": f"Fórum suspenso por {horas} horas com sucesso.", "suspend_reason": motivo, "suspended_until": suspended_until.isoformat()}

@app.patch("/admin/foruns/{forum_id}/ativar", status_code=status.HTTP_200_OK)
async def ativar_forum_admin(
    forum_id: int, 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    is_admin = "admin" in utilizador_email.lower()
    if not is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")
    
    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == forum_id))
    forum = forum_res.scalars().first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")

    forum.is_suspended = 0
    forum.suspend_reason = None
    forum.suspended_until = None
    await db.commit()
    await db.refresh(forum)
    
    return {"mensagem": "Fórum reativado com sucesso.", "is_suspended": 0}

@app.get("/admin/foruns/denuncias")
async def listar_denuncias_foruns(
    status_filtro: Optional[str] = Query(None, alias="status"),
    gravidade_filtro: Optional[str] = Query(None, alias="gravidade"),
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    is_admin = "admin" in utilizador_email.lower()
    if not is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")
        
    query = select(models.ForumDenunciaModel)
    if status_filtro:
        query = query.filter(models.ForumDenunciaModel.status == status_filtro)
    if gravidade_filtro:
        query = query.filter(models.ForumDenunciaModel.gravidade == gravidade_filtro)

    denuncia_res = await db.execute(query)
    denuncias = denuncia_res.scalars().all()
    resultado = []
    for d in denuncias:
        forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == d.forum_id))
        forum = forum_res.scalars().first()
        resultado.append({
            "id": d.id,
            "forum_id": d.forum_id,
            "forum_titulo": forum.titulo if forum else "Fórum Removido",
            "forum_suspenso": forum.is_suspended if forum else 0,
            "autor_email": d.autor_email,
            "motivo": d.motivo,
            "evidencia": getattr(d, "evidencia", None),
            "status": getattr(d, "status", "pendente"),
            "gravidade": getattr(d, "gravidade", "moderada"),
            "created_at": d.created_at
        })
    return resultado

@app.delete("/admin/foruns/denuncias/{denuncia_id}/ignorar", status_code=status.HTTP_200_OK)
async def ignorar_denuncia_admin(
    denuncia_id: int, 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    is_admin = "admin" in utilizador_email.lower()
    if not is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")

    den_res = await db.execute(select(models.ForumDenunciaModel).filter(models.ForumDenunciaModel.id == denuncia_id))
    denuncia = den_res.scalars().first()
    if not denuncia:
        raise HTTPException(status_code=404, detail="Denúncia não encontrada.")

    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == denuncia.forum_id))
    forum = forum_res.scalars().first()
    if forum:
        forum.is_suspended = 0
        forum.suspend_reason = None
        forum.suspended_until = None

    denuncia.status = "ignorado"
    await db.delete(denuncia)
    await db.commit()
    return {"mensagem": "Denúncia ignorada e removida com sucesso, fórum ativado."}

@app.post("/admin/foruns/denuncias/{denuncia_id}/avaliar", status_code=status.HTTP_200_OK)
async def avaliar_denuncia_forum_admin(
    denuncia_id: int, 
    payload: dict = Body(...),
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    is_admin = "admin" in utilizador_email.lower()
    if not is_admin:
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores.")
        
    acao = payload.get("acao")
    if acao not in ["excluir", "suspender", "ignorar"]:
        raise HTTPException(status_code=400, detail="Ação inválida. Use 'excluir', 'suspender' ou 'ignorar'.")

    den_res = await db.execute(select(models.ForumDenunciaModel).filter(models.ForumDenunciaModel.id == denuncia_id))
    denuncia = den_res.scalars().first()
    if not denuncia:
        raise HTTPException(status_code=404, detail="Denúncia não encontrada.")
    
    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == denuncia.forum_id))
    forum = forum_res.scalars().first()

    if acao == "excluir":
        if forum:
            await db.delete(forum)
        denuncia.status = "resolvido_excluido"
    elif acao == "suspender":
        dias = int(payload.get("dias_suspensao", 7))
        if forum:
            forum.is_suspended = 1
            forum.suspend_reason = f"Suspenso por denúncia avaliada. Motivo: {denuncia.motivo}"
            forum.suspended_until = datetime.utcnow() + timedelta(days=dias)
        denuncia.status = "resolvido_suspenso"
    elif acao == "ignorar":
        if forum:
            forum.is_suspended = 0
            forum.suspend_reason = None
            forum.suspended_until = None
        denuncia.status = "ignorado"

    await db.commit()
    return {"mensagem": f"Denúncia avaliada com sucesso com a ação: {acao}", "denuncia_id": denuncia_id, "status": denuncia.status}

@app.get("/foruns/{forum_id}/mensagens", response_model=list[schemas.ForumMensagemResponse])
async def listar_mensagens_forum(forum_id: int, db: AsyncSession = Depends(obter_db)):
    topico_res = await db.execute(select(models.ForumTopicoModel).filter(models.ForumTopicoModel.forum_id == forum_id))
    topicos = topico_res.scalars().all()
    topico_ids = [t.id for t in topicos]
    if not topico_ids:
        return []
    msg_res = await db.execute(select(models.ForumTopicoMensagemModel).filter(models.ForumTopicoMensagemModel.topico_id.in_(topico_ids)))
    mensagens = msg_res.scalars().all()
    
    resultado = []
    for m in mensagens:
        resultado.append({
            "id": m.id,
            "forum_id": forum_id,
            "conteudo": m.conteudo,
            "autor": m.autor,
            "autor_email": m.autor_email,
            "created_at": m.created_at
        })
    return resultado

@app.post("/foruns/{forum_id}/mensagens", response_model=schemas.ForumMensagemResponse, status_code=status.HTTP_201_CREATED)
async def enviar_mensagem_forum(forum_id: int, msg: schemas.ForumMensagemCreate, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == forum_id))
    forum = forum_res.scalars().first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    
    if getattr(forum, "is_suspended", 0) == 1:
        raise HTTPException(status_code=403, detail="Este fórum encontra-se banido e não aceita novas mensagens.")
    
    topico_res = await db.execute(select(models.ForumTopicoModel).filter(models.ForumTopicoModel.forum_id == forum_id))
    topico = topico_res.scalars().first()
    nome_utilizador = utilizador_email.split('@')[0]
    
    if not topico:
        topico = models.ForumTopicoModel(
            forum_id=forum_id,
            titulo=f"Discussão Geral - {forum.titulo}",
            conteudo="Tópico gerado por mensagem automática.",
            autor=nome_utilizador,
            autor_email=utilizador_email
        )
        db.add(topico)
        await db.commit()
        await db.refresh(topico)

    nova_msg = models.ForumTopicoMensagemModel(
        topico_id=topico.id,
        conteudo=msg.conteudo,
        autor=nome_utilizador,
        autor_email=utilizador_email
    )
    db.add(nova_msg)
    await db.commit()
    await db.refresh(nova_msg)
    
    return {
        "id": nova_msg.id,
        "forum_id": forum_id,
        "conteudo": nova_msg.conteudo,
        "autor": nova_msg.autor,
        "autor_email": nova_msg.autor_email,
        "created_at": nova_msg.created_at
    }

@app.get("/foruns/{forum_id}/membros", response_model=list[schemas.MembroForumResponse])
async def listar_membros_forum(forum_id: int, db: AsyncSession = Depends(obter_db)):
    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == forum_id))
    forum = forum_res.scalars().first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    
    topico_res = await db.execute(select(models.ForumTopicoModel).filter(models.ForumTopicoModel.forum_id == forum_id))
    topicos = topico_res.scalars().all()
    topico_ids = [t.id for t in topicos]
    
    autores = []
    if topico_ids:
        autores_res = await db.execute(
            select(models.ForumTopicoMensagemModel.autor, models.ForumTopicoMensagemModel.autor_email)
            .filter(models.ForumTopicoMensagemModel.topico_id.in_(topico_ids))
            .distinct()
        )
        autores = autores_res.all()
    
    membros = []
    vitos = set()
    
    if forum.creator_email:
        nome_criador = forum.creator_email.split('@')[0]
        vitos.add(forum.creator_email)
        membros.append({"nome": nome_criador, "email": forum.creator_email, "status": "Online • Criador"})

    for autor, email in autores:
        if email not in vitos:  
            vitos.add(email)
            membros.append({"nome": autor, "email": email or "utilizador@ludarium.com", "status": "Online"})
            
    return membros

@app.get("/grupos", response_model=list[schemas.GrupoPrivadoResponse])
async def listar_grupos(db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    termo_busca = utilizador_email.strip().lower()
    termo_prefixo = termo_busca.split('@')[0]
    
    membros_res = await db.execute(select(models.GrupoMembroModel).filter(
        (models.GrupoMembroModel.user_email.ilike(f"%{termo_busca}%")) |
        (models.GrupoMembroModel.user_email.ilike(f"%{termo_prefixo}%"))
    ))
    membros_registos = membros_res.scalars().all()
    
    grupo_ids = [m.grupo_id for m in membros_registos]
    
    grupos_res = await db.execute(select(models.GrupoPrivadoModel).filter(
        (models.GrupoPrivadoModel.id.in_(grupo_ids)) | 
        (models.GrupoPrivadoModel.owner_email.ilike(f"%{termo_busca}%")) |
        (models.GrupoPrivadoModel.owner_email.ilike(f"%{termo_prefixo}%"))
    ))
    grupos = grupos_res.scalars().all()

    if not grupos and not membros_registos:
        grupo_padrao = models.GrupoPrivadoModel(
            nome="Equipa Ludarium Alpha",
            descricao="Grupo inicial de desenvolvimento do projeto Ludarium.",
            tipo="grupo",
            owner_email=termo_busca
        )
        db.add(grupo_padrao)
        await db.commit()
        await db.refresh(grupo_padrao)
        
        membro_padrao = models.GrupoMembroModel(grupo_id=grupo_padrao.id, user_email=termo_busca, role="admin")
        db.add(membro_padrao)
        await db.commit()
        grupos = [grupo_padrao]

    return grupos

@app.post("/grupos/{grupo_id}/membros", status_code=status.HTTP_201_CREATED)
async def adicionar_membro_grupo(
    grupo_id: int, 
    membro_email: str = Query(..., alias="membro_email"), 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    admin_res = await db.execute(select(models.GrupoMembroModel).filter_by(grupo_id=grupo_id, user_email=utilizador_email, role="admin"))
    admin_check = admin_res.scalars().first()
    
    criador_res = await db.execute(select(models.GrupoPrivadoModel).filter_by(id=grupo_id, owner_email=utilizador_email))
    grupo_criador = criador_res.scalars().first()
    
    if not admin_check and not grupo_criador:
        raise HTTPException(status_code=403, detail="Apenas administradores do chat/grupo podem convidar novos utilizadores.")

    grupo_res = await db.execute(select(models.GrupoPrivadoModel).filter(models.GrupoPrivadoModel.id == grupo_id))
    grupo = grupo_res.scalars().first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Chat/Grupo não encontrado")
    
    email_alvo = membro_email.strip().lower()
    if "@" not in email_alvo:
        email_alvo = f"{email_alvo}@ludarium.com"
        
    existe_res = await db.execute(select(models.GrupoMembroModel).filter_by(grupo_id=grupo_id, user_email=email_alvo))
    existe = existe_res.scalars().first()
    if existe:
        raise HTTPException(status_code=400, detail="Utilizador já é membro deste chat/grupo")
        
    novo_membro = models.GrupoMembroModel(grupo_id=grupo_id, user_email=email_alvo, role="membro")
    db.add(novo_membro)

    notificacao = models.NotificationModel(
        user_id=email_alvo,
        content=f"🔔 @{utilizador_email.split('@')[0]} adicionou-o ao chat: '{grupo.nome}'."
    )
    db.add(notificacao)

    await db.commit()
    return {"mensagem": "Membro adicionado e notificado com sucesso!"}

@app.post("/grupos", response_model=schemas.GrupoPrivadoResponse, status_code=status.HTTP_201_CREATED)
async def criar_chat_ou_grupo(grupo: schemas.GrupoPrivadoCreate, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    if not grupo.nome or not grupo.nome.strip():
        raise HTTPException(status_code=400, detail="O chat privado ou grupo deve conter um título/assunto válido.")

    novo_grupo = models.GrupoPrivadoModel(
        nome=grupo.nome.strip(),
        descricao=grupo.descricao,
        tipo=getattr(grupo, "tipo", "privado"),
        owner_email=utilizador_email
    )
    db.add(novo_grupo)
    await db.commit()
    await db.refresh(novo_grupo)
    
    membro_owner = models.GrupoMembroModel(grupo_id=novo_grupo.id, user_email=utilizador_email, role="admin")
    db.add(membro_owner)
    
    if grupo.membros_usernames:
        for username in grupo.membros_usernames:
            username_limpo = username.strip()
            if username_limpo:
                email_membro = username_limpo if "@" in username_limpo else f"{username_limpo}@ludarium.com"
                existe_res = await db.execute(select(models.GrupoMembroModel).filter_by(grupo_id=novo_grupo.id, user_email=email_membro))
                existe = existe_res.scalars().first()
                if not existe:
                    db.add(models.GrupoMembroModel(grupo_id=novo_grupo.id, user_email=email_membro, role="membro"))
                    
                    await criar_notificacao_aux(
                        db,
                        email_membro,
                        f"🔔 Foi convidado por @{utilizador_email.split('@')[0]} para o chat: '{novo_grupo.nome}'."
                    )
    
    await db.commit()
    return novo_grupo

@app.delete("/grupos/{grupo_id}", status_code=status.HTTP_200_OK)
async def apagar_grupo(
    grupo_id: int, 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    admin_res = await db.execute(select(models.GrupoMembroModel).filter_by(grupo_id=grupo_id, user_email=utilizador_email, role="admin"))
    admin_check = admin_res.scalars().first()
    
    grupo_res = await db.execute(select(models.GrupoPrivadoModel).filter(models.GrupoPrivadoModel.id == grupo_id))
    grupo = grupo_res.scalars().first()
    
    if not grupo:
        raise HTTPException(status_code=404, detail="Chat/Grupo não encontrado.")

    is_owner = grupo.owner_email and grupo.owner_email.lower() == utilizador_email.lower()
    if not admin_check and not is_owner:
        raise HTTPException(status_code=403, detail="Apenas o criador ou administradores podem apagar este chat/grupo.")

    membros_res = await db.execute(select(models.GrupoMembroModel).filter_by(grupo_id=grupo_id))
    for m in membros_res.scalars().all():
        await db.delete(m)

    msgs_res = await db.execute(select(models.GrupoMensagemModel).filter_by(grupo_id=grupo_id))
    for msg in msgs_res.scalars().all():
        await db.delete(msg)
    
    await db.delete(grupo)
    await db.commit()
    return {"mensagem": "Grupo apagado com sucesso."}

@app.get("/grupos/{grupo_id}/membros")
async def listar_membros_grupo(
    grupo_id: int, 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    membros_res = await db.execute(select(models.GrupoMembroModel).filter_by(grupo_id=grupo_id))
    membros = membros_res.scalars().all()
    resultado = []
    for m in membros:
        nome = m.user_email.split('@')[0]
        resultado.append({
            "email": m.user_email,
            "nome": nome.capitalize(),
            "username": f"@{nome}",
            "role": m.role
        })
    return resultado    

@app.delete("/grupos/{grupo_id}/membros/{membro_id}", status_code=status.HTTP_200_OK)
async def remover_membro_grupo(
    grupo_id: int, 
    membro_id: str, 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    email_atual = utilizador_email.strip().lower()

    grupo_res = await db.execute(select(models.GrupoPrivadoModel).filter_by(id=grupo_id))
    grupo = grupo_res.scalars().first()
    
    if not grupo:
        raise HTTPException(status_code=404, detail="Chat/Grupo não encontrado.")

    is_owner = grupo.owner_email and grupo.owner_email.strip().lower() == email_atual

    admin_res = await db.execute(
        select(models.GrupoMembroModel).filter(
            models.GrupoMembroModel.grupo_id == grupo_id,
            (models.GrupoMembroModel.user_email.ilike(f"%{email_atual}%")) |
            (models.GrupoMembroModel.user_email.ilike(f"%{email_atual.split('@')[0]}%"))
        )
    )
    membros_usuario = admin_res.scalars().all()
    
    tem_permissao = is_owner or any(m.role == "admin" for m in membros_usuario)

    if not tem_permissao:
        raise HTTPException(status_code=403, detail="Apenas administradores ou o criador do grupo podem excluir utilizadores.")

    membro_alvo = None
    membro_id_limpo = urllib.parse.unquote(membro_id).strip().lower()

    if membro_id_limpo.isdigit():
        membro_res = await db.execute(
            select(models.GrupoMembroModel).filter_by(grupo_id=grupo_id, id=int(membro_id_limpo))
        )
        membro_alvo = membro_res.scalars().first()
    
    if not membro_alvo:
        email_alvo = membro_id_limpo
        if "@" not in email_alvo and not email_alvo.endswith("@ludarium.com"):
            email_alvo = f"{email_alvo}@ludarium.com"
        
        membro_res = await db.execute(
            select(models.GrupoMembroModel).filter(
                models.GrupoMembroModel.grupo_id == grupo_id,
                (models.GrupoMembroModel.user_email.ilike(f"%{email_alvo}%")) |
                (models.GrupoMembroModel.user_email.ilike(f"%{email_alvo.split('@')[0]}%"))
            )
        )
        membro_alvo = membro_res.scalars().first()

    if not membro_alvo:
        raise HTTPException(status_code=404, detail="Membro não encontrado no grupo.")

    await db.delete(membro_alvo)
    await db.commit()
    return {"mensagem": "Membro removido do chat/grupo com sucesso."}

@app.patch("/grupos/{grupo_id}/titulo", status_code=status.HTTP_200_OK)
async def atualizar_titulo_chat(
    grupo_id: int, 
    payload: dict = Body(...), 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    admin_res = await db.execute(select(models.GrupoMembroModel).filter_by(grupo_id=grupo_id, user_email=utilizador_email, role="admin"))
    admin_check = admin_res.scalars().first()

    grupo_res = await db.execute(select(models.GrupoPrivadoModel).filter(models.GrupoPrivadoModel.id == grupo_id))
    grupo = grupo_res.scalars().first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Chat/Grupo não encontrado.")

    is_owner = grupo.owner_email and grupo.owner_email.lower() == utilizador_email.lower()

    if not admin_check and not is_owner:
        raise HTTPException(status_code=403, detail="Apenas administradores ou o criador podem alterar o título do chat.")

    novo_titulo = payload.get("nome") or payload.get("titulo")
    if not novo_titulo or not novo_titulo.strip():
        raise HTTPException(status_code=400, detail="O novo título não pode estar vazio.")

    grupo.nome = novo_titulo.strip()
    await db.commit()
    return {"mensagem": "Título do chat atualizado com sucesso!", "novo_titulo": grupo.nome}

@app.get("/grupos/{grupo_id}/mensagens", response_model=list[schemas.GrupoMensagemResponse])
async def listar_mensagens_grupo(grupo_id: int, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    msg_res = await db.execute(select(models.GrupoMensagemModel).filter(models.GrupoMensagemModel.grupo_id == grupo_id))
    mensagens = msg_res.scalars().all()
    if not mensagens:
        msg_inicial = models.GrupoMensagemModel(
            grupo_id=grupo_id,
            autor="Sistema",
            autor_email="system@ludarium.com",
            conteudo="Bem-vindos ao chat de conversa e produção! O ambiente está pronto para chat por texto, voz e videochamadas."
        )
        db.add(msg_inicial)
        await db.commit()
        await db.refresh(msg_inicial)
        mensagens = [msg_inicial]
    return mensagens

@app.post("/grupos/{grupo_id}/mensagens", response_model=schemas.GrupoMensagemResponse, status_code=status.HTTP_201_CREATED)
async def enviar_mensagem_grupo(grupo_id: int, mensagem: schemas.GrupoMensagemCreate, db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    grupo_res = await db.execute(select(models.GrupoPrivadoModel).filter(models.GrupoPrivadoModel.id == grupo_id))
    grupo = grupo_res.scalars().first()
    if not grupo:
        raise HTTPException(status_code=404, detail="Chat/Grupo não encontrado")
        
    nome_utilizador = utilizador_email.split('@')[0]
    nova_msg = models.GrupoMensagemModel(
        grupo_id=grupo_id,
        autor=nome_utilizador,
        autor_email=utilizador_email,
        conteudo=mensagem.conteudo
    )
    db.add(nova_msg)
    await db.commit()
    await db.refresh(nova_msg)
    return nova_msg

@app.post("/foruns/{forum_id}/denunciar", status_code=status.HTTP_201_CREATED)
async def denunciar_forum(
    forum_id: int, 
    denuncia: schemas.ForumDenunciaCreate, 
    db: AsyncSession = Depends(obter_db), 
    utilizador_email: str = Depends(obter_utilizador_atual)
):
    # 1. Verifica se o fórum existe
    forum_res = await db.execute(select(models.ForumModel).filter(models.ForumModel.id == forum_id))
    forum = forum_res.scalars().first()
    if not forum:
        raise HTTPException(status_code=404, detail="Fórum não encontrado")
    
    # 2. Cria a denúncia com os dados validados pelo Schema Pydantic
    nova_denuncia = models.ForumDenunciaModel(
        forum_id=forum_id,
        autor_email=utilizador_email,
        motivo=denuncia.motivo,
        evidencia=denuncia.evidencia, # Já mapeado de forma segura pelo Pydantic
    )
    
    db.add(nova_denuncia)
    await db.commit()
    await db.refresh(nova_denuncia)
    
    return {
        "mensagem": "Denúncia enviada com sucesso. A administração irá analisar.", 
        "id": nova_denuncia.id
    }

@app.get("/usuarios/buscar")
async def buscar_usuarios(q: str = Query("", description="Termo de busca por nome ou email"), db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    termo = q.lower().strip()
    
    emails_encontrados = set()
    
    try:
        cand_res = await db.execute(select(models.PublicacaoCandidatoModel))
        for c in cand_res.scalars().all():
            if c.user_email: emails_encontrados.add(c.user_email.lower())
            
        memb_res = await db.execute(select(models.GrupoMembroModel))
        for m in memb_res.scalars().all():
            if m.user_email: emails_encontrados.add(m.user_email.lower())
            
        pub_res = await db.execute(select(models.PublicacaoModel))
        for p in pub_res.scalars().all():
            if p.creator_email: emails_encontrados.add(p.creator_email.lower())
            
        top_res = await db.execute(select(models.ForumTopicoModel))
        for t in top_res.scalars().all():
            if t.autor_email: emails_encontrados.add(t.autor_email.lower())
            
        tm_res = await db.execute(select(models.ForumTopicoMensagemModel))
        for tm in tm_res.scalars().all():
            if tm.autor_email: emails_encontrados.add(tm.autor_email.lower())
            
        gm_res = await db.execute(select(models.GrupoMensagemModel))
        for gm in gm_res.scalars().all():
            if gm.autor_email: emails_encontrados.add(gm.autor_email.lower())
            
        cm_res = await db.execute(select(models.CandidaturaMensagemModel))
        for cm in cm_res.scalars().all():
            if cm.autor_email: emails_encontrados.add(cm.autor_email.lower())
            
        fd_res = await db.execute(select(models.ForumDenunciaModel))
        for fd in fd_res.scalars().all():
            if fd.autor_email: emails_encontrados.add(fd.autor_email.lower())
    except Exception as e:
        print(f"Aviso ao recolher e-mails dinamicamente: {e}")
        
    emails_encontrados.update([
        "user1@ludarium.com", "user2@ludarium.com", "user3@ludarium.com", 
        "admin@ludarium.com", "caio@ludarium.com", "marina@ludarium.com", "rafael@ludarium.com"
    ])
    
    resultado = []
    for email in emails_encontrados:
        nome = email.split('@')[0]
        username = f"@{nome}"
        if not termo or termo in nome.lower() or termo in email.lower():
            resultado.append({
                "email": email,
                "nome": nome.capitalize(),
                "username": username
            })
            
    return resultado

@app.get("/meus-chats-recrutador")
async def listar_meus_chats_recrutador(db: AsyncSession = Depends(obter_db), utilizador_email: str = Depends(obter_utilizador_atual)):
    email_atual = utilizador_email.strip().lower()
    is_admin = "admin" in email_atual

    pubs_res = await db.execute(select(models.PublicacaoModel))
    todas_pubs = pubs_res.scalars().all()

    if is_admin:
        publicacoes = todas_pubs
    else:
        publicacoes = [p for p in todas_pubs if p.creator_email and p.creator_email.strip().lower() == email_atual]

    pub_ids = [p.id for p in publicacoes]

    if not pub_ids:
        return []

    cand_res = await db.execute(
        select(models.PublicacaoCandidatoModel)
        .filter(models.PublicacaoCandidatoModel.publicacao_id.in_(pub_ids))
    )
    candidaturas = cand_res.scalars().all()

    resultado = []
    for c in candidaturas:
        pub = next((p for p in publicacoes if p.id == c.publicacao_id), None)
        resultado.append({
            "id": c.id,
            "candidatura_id": c.id,
            "publicacao_id": c.publicacao_id,
            "titulo_vaga": pub.titulo if pub else "Vaga",
            "candidato_nome": c.nome,
            "candidato_email": c.user_email,
            "recrutador": pub.autor if pub else "Recrutador",
            "recrutador_email": pub.creator_email if pub else "",
            "status": c.status,
            "papel": c.papel,
            "chat_liberado": getattr(c, "chat_liberado", 0)
        })
    return resultado