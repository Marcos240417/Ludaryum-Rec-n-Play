# Caminho: servico-de-gateway/main.py
import os
import httpx
import websockets
import asyncio
from fastapi import FastAPI, Request, HTTPException, Header, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Gateway de API - Ludarium (Global & Sincronizado)", version="1.2.2")

# Configuração de CORS irrestrita para suporte multiplataforma e túneis
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Caminhos base para localizar os frontends com absoluta precisão
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_SERVICES_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))

# Mapeamento seguro das pastas de frontend em cada microsserviço
PATH_HOME = os.path.join(ROOT_SERVICES_DIR, "project-service", "home.frontend")
PATH_CAMPANHAS = os.path.join(ROOT_SERVICES_DIR, "servico-de-campanhas", "frontend")
PATH_COMUNIDADE = os.path.join(ROOT_SERVICES_DIR, "servico-de-comunidade", "frontend")
PATH_PERFIL = os.path.join(ROOT_SERVICES_DIR, "servico-de-perfil", "frontend")
PATH_ADMIN = os.path.join(ROOT_SERVICES_DIR, "admin-dashboard")
PATH_CONFIGURACOES = os.path.abspath(os.path.join(ROOT_SERVICES_DIR, "configuracoes", "frontend"))

# Montar os ficheiros estáticos de forma tolerante e segura
if os.path.exists(PATH_HOME):
    app.mount("/home-ui", StaticFiles(directory=PATH_HOME), name="home_ui")

if os.path.exists(PATH_CAMPANHAS):
    app.mount("/campanhas-ui", StaticFiles(directory=PATH_CAMPANHAS), name="campanhas_ui")

if os.path.exists(PATH_COMUNIDADE):
    app.mount("/comunidade-ui", StaticFiles(directory=PATH_COMUNIDADE), name="comunidade_ui")

if os.path.exists(PATH_PERFIL):
    app.mount("/perfil-ui", StaticFiles(directory=PATH_PERFIL), name="perfil_ui")

if os.path.exists(PATH_ADMIN):
    app.mount("/admin-ui", StaticFiles(directory=PATH_ADMIN), name="admin_ui")

if os.path.exists(PATH_CONFIGURACOES):
    app.mount("/configuracoes", StaticFiles(directory=PATH_CONFIGURACOES), name="configuracoes_ui")

# Mapeamento com as portas reais dos microsserviços
SERVICOS = {
    "auth": "http://localhost:8001",
    "projetos": "http://localhost:8081",
    "comunidade": "http://localhost:8002",
    "campanhas": "http://localhost:8003",
    "perfil": "http://localhost:8004",
    "configuracoes": "http://localhost:8006",
    "gateway": "http://localhost:8005"
}

# Cliente HTTP assíncrono global reutilizável para alta performance
client = httpx.AsyncClient(timeout=30.0)

@app.on_event("shutdown")
async def shutdown_event():
    await client.aclose()

@app.get("/", response_class=HTMLResponse)
def raiz():
    """Página de Hub Central para a Apresentação e Testes Visuais Globais"""
    return """
    <!DOCTYPE html>
    <html lang="pt">
    <head>
        <meta charset="UTF-8">
        <title>Ludarium - Hub Global de Apresentação</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 40px; margin: 0; }
            .container { max-width: 850px; margin: 0 auto; background: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
            h1 { color: #38bdf8; text-align: center; margin-bottom: 5px; }
            p.subtitle { text-align: center; color: #94a3b8; margin-top: 0; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 30px; }
            .card { background: #334155; padding: 20px; border-radius: 8px; text-decoration: none; color: #fff; transition: 0.2s; border-left: 5px solid #38bdf8; display: block; }
            .card:hover { background: #475569; transform: translateY(-3px); }
            .card h3 { margin: 0 0 8px 0; color: #38bdf8; }
            .card p { margin: 0; text-align: left; font-size: 14px; color: #cbd5e1; }
            .footer { text-align: center; margin-top: 30px; font-size: 13px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 Ecossistema Ludarium (Global)</h1>
            <p class="subtitle">Gateway Centralizado & Sincronização Total de Dados</p>
            <div class="grid">
                <a href="/home-ui/home.html" class="card">
                    <h3>🏠 Home / Projetos</h3>
                    <p>Portefólio e ecrã principal sincronizado.</p>
                </a>
                <a href="/home-ui/login.html" class="card">
                    <h3>🔑 Autenticação & Login</h3>
                    <p>Ecrã de acesso e sessão global unificada.</p>
                </a>
                <a href="/campanhas-ui/campanhas.html" class="card">
                    <h3>🏆 Campanhas, Prémios & XP</h3>
                    <p>Desafios, gamificação e atribuição de XP.</p>
                </a>
                <a href="/comunidade-ui/community.html" class="card">
                    <h3>💬 Comunidade, Chats & Avisos</h3>
                    <p>Feed social, fóruns, avisos e chats em tempo real.</p>
                </a>
                <a href="/perfil-ui/perfil.html" class="card">
                    <h3>👤 Perfil do Utilizador</h3>
                    <p>Estatísticas, nível, troféus e dados globais.</p>
                </a>
                <a href="/configuracoes/configuracoes.html" class="card">
                    <h3>⚙️ Configurações Globais</h3>
                    <p>Preferências da conta refletidas em todo o projeto.</p>
                </a>
            </div>
            <div class="footer">
                Ludarium Backend &bull; Sincronização Global Ativa para Configurações, XP, Reações e Chats
            </div>
        </div>
    </body>
    </html>
    """

async def reencaminhar_pedido(servico_url: str, request: Request, path: str):
    url = f"{servico_url}/{path}" if path else servico_url
    headers = dict(request.headers)
    headers.pop("host", None)
    
    body = await request.body()
    params = request.query_params

    try:
        response = await client.request(
            method=request.method,
            url=url,
            headers=headers,
            content=body,
            params=params
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=dict(response.headers)
        )
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="O microsserviço de destino encontra-se indisponível ou offline.")

# --- Rota WebSocket Global Otimizada e Corrigida para Todos os Chats ---
@app.websocket("/ws/{path:path}")
async def gateway_websocket_proxy(websocket: WebSocket, path: str):
    await websocket.accept()
    
    query_params = websocket.query_params
    query_string = f"?{query_params}" if query_params else ""
    
    comunidade_ws_base = SERVICOS["comunidade"].replace("http://", "ws://").replace("https://", "wss://")
    target_url = f"{comunidade_ws_base}/ws/{path}{query_string}"
    
    try:
        async with websockets.connect(target_url) as backend_ws:
            async def forward_client_to_backend():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await backend_ws.send(data)
                except Exception:
                    pass

            async def forward_backend_to_client():
                try:
                    async for message in backend_ws:
                        await websocket.send_text(message)
                except Exception:
                    pass

            await asyncio.gather(forward_client_to_backend(), forward_backend_to_client())
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Erro no Proxy WebSocket do Gateway ({path}): {e}")
        try:
            await websocket.close()
        except Exception:
            pass

@app.get("/perfil/leaderboard")
async def gateway_leaderboard(authorization: str = Header(None)):
    headers = {"Authorization": authorization} if authorization else {}
    try:
        response = await client.get(f"{SERVICOS['perfil']}/perfil/leaderboard", headers=headers)
        if response.status_code != 200:
            return {"erro": "Erro no Serviço de Perfil", "detalhes": response.text}, response.status_code
        return response.json()
    except httpx.ConnectError:
        return {"erro": "Serviço de Perfil inacessível na porta 8004"}, 503

# --- Rotas de Autenticação & Logins Globais ---
@app.post("/login")
async def gw_login(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "login")

@app.post("/register")
async def gw_register(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "register")

@app.post("/recover-password")
async def gw_recover_password(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "recover-password")

@app.get("/me")
async def gw_me(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "me")

# --- Rotas de Utilizadores, Dossiê e Limpeza Forense ---
@app.get("/admin/dossie-completo")
async def gw_admin_dossie(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "admin/dossie-completo")

@app.get("/api/admin/dossier")
async def gw_api_admin_dossier(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "api/admin/dossier")

@app.delete("/admin/dossie-forense/limpar")
async def gw_limpar_dossie_forense(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "admin/dossie-forense/limpar")

@app.api_route("/users", methods=["GET", "POST"])
async def gw_users_root(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "users")

@app.api_route("/users/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_users_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["auth"], request, f"users/{path}")

# --- Rotas de Projetos ---
@app.get("/projects")
async def gw_projects_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["projetos"], request, "projects")

@app.post("/projects")
async def gw_projects_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["projetos"], request, "projects")

@app.api_route("/projects/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_projects_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["projetos"], request, f"projects/{path}")

@app.get("/sandbox/{path:path}")
async def gw_sandbox(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["projetos"], request, f"sandbox/{path}")

@app.get("/posters/{path:path}")
async def gw_posters(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["projetos"], request, f"posters/{path}")

@app.api_route("/sandbox_builds/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_sandbox_builds(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["projetos"], request, f"sandbox_builds/{path}")

# --- Rotas de Perfil, XP e Prémios ---
@app.get("/perfil")
async def gw_perfil_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["perfil"], request, "perfil")

@app.put("/perfil")
async def gw_perfil_put(request: Request):
    return await reencaminhar_pedido(SERVICOS["perfil"], request, "perfil")

@app.api_route("/perfil/{path:path}", methods=["GET", "PUT", "PATCH", "DELETE", "POST"])
async def gw_perfil_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["perfil"], request, f"perfil/{path}")

# --- Rotas de Configurações Globais ---
@app.api_route("/configuracoes/{path:path}", methods=["GET", "PUT", "POST", "DELETE", "PATCH"])
async def gw_configuracoes_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["configuracoes"], request, f"configuracoes/{path}")

@app.api_route("/configuracoes", methods=["GET", "PUT", "POST", "PATCH"])
async def gw_configuracoes_root(request: Request):
    return await reencaminhar_pedido(SERVICOS["configuracoes"], request, "configuracoes")

# --- Rotas de Comunidade, Reações, Comentários e Fóruns ---
@app.get("/publicacoes")
async def gw_publicacoes_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "publicacoes")

@app.post("/publicacoes")
async def gw_publicacoes_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "publicacoes")

@app.api_route("/publicacoes/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_publicacoes_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"publicacoes/{path}")

@app.api_route("/candidatos/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_candidatos_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"candidatos/{path}")

@app.api_route("/candidaturas/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_candidaturas_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"candidaturas/{path}")

@app.api_route("/comentarios/{path:path}", methods=["GET", "POST", "DELETE", "PATCH"])
async def gw_comentarios_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"comentarios/{path}")

@app.get("/oportunidades")
async def gw_oportunidades(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "oportunidades")

@app.get("/recomendados/skills")
async def gw_skills(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "recomendados/skills")

@app.api_route("/messages", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def gw_messages_root(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "messages")

@app.api_route("/messages/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def gw_messages(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"messages/{path}")

@app.get("/usuarios/buscar")
async def gw_usuarios_buscar(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "usuarios/buscar")

# --- Rotas de Fóruns Públicos ---
@app.get("/foruns")
async def gw_foruns_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "foruns")

@app.post("/foruns")
async def gw_foruns_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "foruns")

@app.api_route("/foruns/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_foruns_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"foruns/{path}")

@app.api_route("/admin/foruns/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_admin_foruns(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"admin/foruns/{path}")

@app.api_route("/topicos/{path:path}", methods=["GET", "POST", "DELETE"])
async def gw_topicos(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"topicos/{path}")

# --- Rotas de Grupos Privados e Chats de Equipa ---
@app.get("/grupos")
async def gw_grupos_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "grupos")

@app.post("/grupos")
async def gw_grupos_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "grupos")

@app.api_route("/grupos/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_grupos_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"grupos/{path}")

# --- Rotas de Campanhas, Desafios, Prémios e XP ---
@app.get("/progresso-usuario")
async def gw_progresso(request: Request):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, "progresso-usuario")

@app.get("/campanhas")
async def gw_campanhas_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, "campanhas")

@app.post("/campanhas")
async def gw_campanhas_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, "campanhas")

@app.api_route("/campanhas/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_campanhas_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, f"campanhas/{path}")

@app.api_route("/objetivos/{path:path}", methods=["GET", "POST", "PATCH", "DELETE"])
async def gw_objetivos(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, f"objetivos/{path}")

# --- Rotas de Notificações e Avisos ---
@app.get("/notifications")
async def gw_notifications_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "notifications")

@app.post("/notifications")
async def gw_notifications_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "notifications")

@app.api_route("/notifications/{path:path}", methods=["GET", "POST", "PATCH", "DELETE"])
async def gw_notifications_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"notifications/{path}")

# --- Rotas de Administração e Verificação de Permissões ---
@app.get("/auth/verificar-admin")
async def gw_verificar_admin(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "auth/verificar-admin")

@app.api_route("/admin/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_admin_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["auth"], request, f"admin/{path}")