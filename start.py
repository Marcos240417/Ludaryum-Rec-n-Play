import subprocess
import sys
import os
import time

# Definição dos microsserviços, respetivas pastas e portas
SERVICOS = [
    {"nome": "Auth Service", "pasta": "services/auth-service", "porta": 8001},
    {"nome": "Project Service", "pasta": "services/project-service", "porta": 8081},
    {"nome": "Serviço de Comunidade", "pasta": "services/servico-de-comunidade", "porta": 8002},
    {"nome": "Serviço de Campanhas", "pasta": "services/servico-de-campanhas", "porta": 8003},
    {"nome": "Serviço de Perfil", "pasta": "services/servico-de-perfil", "porta": 8004},
    {"nome": "Gateway de API", "pasta": "services/servico-de-gateway", "porta": 8005},
]

processos = []

def iniciar_servicos():
    print("==================================================")
    print(" 🚀 A INICIAR O ECOSSISTEMA LUDARIUM (MICROSERVIÇOS)")
    print("==================================================")
    
    raiz_projeto = os.path.dirname(os.path.abspath(__file__))

    for servico in SERVICOS:
        caminho_pasta = os.path.join(raiz_projeto, servico["pasta"])
        
        if not os.path.exists(caminho_pasta):
            print(f"❌ [Erro] A pasta do serviço '{servico['nome']}' não foi encontrada em: {caminho_pasta}")
            continue

        # Deteta o executável do Python dentro do venv da pasta do serviço (compatível com Windows)
        python_venv = os.path.join(caminho_pasta, "venv", "Scripts", "python.exe")
        if not os.path.exists(python_venv):
            # Fallback para o python global se o venv não existir na pasta
            python_venv = sys.executable

        print(f"▶️ A iniciar [{servico['nome']}] na porta {servico['porta']} (Usando venv)...")
        
        cmd = [
            python_venv, "-m", "uvicorn", 
            "main:app", 
            "--host", "127.0.0.1", 
            "--port", str(servico["porta"]), 
            "--reload"
        ]

        p = subprocess.Popen(cmd, cwd=caminho_pasta)
        processos.append(p)
        time.sleep(0.5)

    print("\n✅ Todos os microsserviços foram iniciados com os seus respetivos ambientes virtuais!")
    print("🌐 Aceda ao Hub Central e Documentação unificada em: http://localhost:8005")
    print("Pressione [CTRL+C] para encerrar todos os serviços em simultâneo.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 A encerrar todos os microsserviços do Ludarium...")
        for p in processos:
            p.terminate()
            p.wait()
        print("👋 Todos os serviços foram encerrados com segurança.")

if __name__ == "__main__":
    iniciar_servicos()