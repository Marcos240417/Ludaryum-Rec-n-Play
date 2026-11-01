# Caminho: servico-de-gateway/main.py
from fastapi import FastAPI, Request, HTTPException, Header, Response, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import httpx
import websockets

app = FastAPI(title="Gateway de API - Ludarium", version="1.1.1")

# Configuração de CORS para permitir requisições do Frontend
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

# Mapeamento com as portas reais dos microsserviços
SERVICOS = {
    "auth": "http://localhost:8001",
    "projetos": "http://localhost:8081",
    "comunidade": "http://localhost:8002",
    "campanhas": "http://localhost:8003",
    "perfil": "http://localhost:8004",
    "gateway": "http://localhost:8005"
}

# Cliente HTTP assíncrono global reutilizável para alta performance
client = httpx.AsyncClient(timeout=30.0)

@app.on_event("shutdown")
async def shutdown_event():
    await client.aclose()

@app.get("/", response_class=HTMLResponse)
def raiz():
    """Página de Hub Central para a Apresentação e Testes Visuais"""
    return """
    <!DOCTYPE html>
    <html lang="pt">
    <head>
        <meta charset="UTF-8">
        <title>Ludarium - Hub de Apresentação</title>
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
            <h1>🚀 Ecossistema Ludarium</h1>
            <p class="subtitle">Gateway de API & Gestão de Interfaces para Apresentação</p>
            <div class="grid">
                <a href="/home-ui/home.html" class="card">
                    <h3>🏠 Home / Projetos</h3>
                    <p>Portefólio e ecrã principal do projeto.</p>
                </a>
                <a href="/home-ui/login.html" class="card">
                    <h3>🔑 Autenticação & Login</h3>
                    <p>Ecrã de acesso e registo de utilizadores.</p>
                </a>
                <a href="/campanhas-ui/campanhas.html" class="card">
                    <h3>🏆 Campanhas & XP</h3>
                    <p>Desafios, objetivos e sistema de gamificação.</p>
                </a>
                <a href="/comunidade-ui/community.html" class="card">
                    <h3>💬 Comunidade & Fóruns</h3>
                    <p>Feed social, publicações, fóruns e conversas.</p>
                </a>
                <a href="/perfil-ui/perfil.html" class="card">
                    <h3>👤 Perfil do Utilizador</h3>
                    <p>Estatísticas, nível, troféus e painel pessoal.</p>
                </a>
                <a href="/docs" class="card" style="border-left-color: #f59e0b;">
                    <h3>📚 Documentação Swagger</h3>
                    <p>Testar rotas e endpoints backend diretamente.</p>
                </a>
            </div>
            <div class="footer">
                Ludarium Backend &bull; Integrado via Cloudflare Tunnel para Apresentação Multidispositivos
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

# --- Rota WebSocket para Chat em Tempo Real ---
@app.websocket("/ws/chat/{chat_id}")
async def gateway_websocket_chat(websocket: WebSocket, chat_id: int):
    await websocket.accept()
    backend_ws_url = SERVICOS["comunidade"].replace("http://", "ws://").replace("https://", "wss://")
    target_url = f"{backend_ws_url}/ws/chat/{chat_id}"

    try:
        async with websockets.connect(target_url) as backend_ws:
            async def client_to_backend():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await backend_ws.send(data)
                except Exception:
                    pass

            async def backend_to_client():
                try:
                    async for message in backend_ws:
                        await websocket.send_text(message)
                except Exception:
                    pass

            import asyncio
            await asyncio.gather(client_to_backend(), backend_to_client())
    except WebSocketDisconnect:
        pass
    except Exception:
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

# --- Rotas de Autenticação ---
@app.post("/login")
async def gw_login(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "login")

@app.post("/register")
async def gw_register(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "register")

@app.get("/me")
async def gw_me(request: Request):
    return await reencaminhar_pedido(SERVICOS["auth"], request, "me")

# --- Rotas de Utilizadores, Dossiê e Limpeza Forense (Encaminhadas para o Auth Service) ---
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

# --- Rotas de Perfil ---
@app.get("/perfil")
async def gw_perfil_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["perfil"], request, "perfil")

@app.put("/perfil")
async def gw_perfil_put(request: Request):
    return await reencaminhar_pedido(SERVICOS["perfil"], request, "perfil")

@app.api_route("/perfil/{path:path}", methods=["GET", "PUT", "PATCH", "DELETE", "POST"])
async def gw_perfil_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["perfil"], request, f"perfil/{path}")

# --- Rotas de Comunidade ---
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

@app.api_route("/comentarios/{path:path}", methods=["GET", "POST", "DELETE"])
async def gw_comentarios_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"comentarios/{path}")

@app.get("/oportunidades")
async def gw_oportunidades(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "oportunidades")

@app.get("/recomendados/skills")
async def gw_skills(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "recomendados/skills")

@app.api_route("/messages/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
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

# --- Rotas de Grupos Privados ---
@app.get("/grupos")
async def gw_grupos_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "grupos")

@app.post("/grupos")
async def gw_grupos_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "grupos")

@app.api_route("/grupos/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def gw_grupos_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"grupos/{path}")

# --- Rotas de Campanhas e Desafios ---
@app.get("/progresso-usuario")
async def gw_progresso(request: Request):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, "progresso-usuario")

@app.get("/campanhas")
async def gw_campanhas_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, "campanhas")

@app.post("/campanhas")
async def gw_campanhas_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, "campanhas")

@app.api_route("/objetivos/{path:path}", methods=["GET", "POST", "PATCH", "DELETE"])
async def gw_objetivos(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["campanhas"], request, f"objetivos/{path}")

# --- Rotas de Notificações ---
@app.get("/notifications")
async def gw_notifications_get(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "notifications")

@app.post("/notifications")
async def gw_notifications_post(request: Request):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, "notifications")

@app.api_route("/notifications/{path:path}", methods=["GET", "POST", "PATCH", "DELETE"])
async def gw_notifications_sub(request: Request, path: str):
    return await reencaminhar_pedido(SERVICOS["comunidade"], request, f"notifications/{path}")