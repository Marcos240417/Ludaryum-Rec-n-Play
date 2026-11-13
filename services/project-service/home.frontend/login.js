function initializeTextGlow() {
    const logo = document.getElementById('ludarium-sign');
    const title = document.getElementById('main-title');
    const intro = document.querySelector('.intro');

    const titleLines = title
        ? Array.from(title.querySelectorAll('.title-line'))
        : [];

    function restartGlow(element, duration = 1800) {
        element.classList.remove('glow-running');
        void element.offsetWidth;
        element.style.setProperty('--glow-duration', `${duration}ms`);
        element.classList.add('glow-running');

        window.setTimeout(() => {
            element.classList.remove('glow-running');
        }, duration + 100);
    }

    if (logo) {
        logo.addEventListener('mouseenter', () => {
            restartGlow(logo, 1800);
        });
    }

    if (title) {
        title.addEventListener('mouseenter', () => {
            titleLines.forEach((line, index) => {
                window.setTimeout(() => {
                    restartGlow(line, 1800);
                }, index * 250);
            });
        });
    }

    if (intro) {
        intro.addEventListener('mouseenter', () => {
            restartGlow(intro, 1800);
        });
    }
}

initializeTextGlow();

// ================= CONFIGURAÇÃO DE ROTA AUTOMÁTICA (LOCAL PORTA 8005/Gateway ou Cloudflare) =================
const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? ""  // Se estiver a usar o Gateway na mesma origem ou directas nas portas
    : `${window.location.protocol}//${window.location.host}`;

// Obter token JWT armazenado estritamente na sessão da aba atual
function obterToken() {
    return sessionStorage.getItem("ludaryumToken") || "";
}

/* ===== ABRIR E FECHAR JANELA DE CADASTRO ===== */
const botaoAbrirCadastro = document.getElementById("abrir-cadastro");
const modalCadastro = document.getElementById("cadastro-modal");
const botaoFecharCadastro = document.getElementById("fechar-cadastro");

if (botaoAbrirCadastro && modalCadastro && botaoFecharCadastro) {
    botaoAbrirCadastro.addEventListener("click", function () {
        modalCadastro.classList.add("aberto");
        modalCadastro.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
    });

    function fecharModalCadastro() {
        modalCadastro.classList.remove("aberto");
        modalCadastro.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }

    botaoFecharCadastro.addEventListener("click", fecharModalCadastro);

    modalCadastro.addEventListener("click", function (evento) {
        if (evento.target === modalCadastro) {
            fecharModalCadastro();
        }
    });

    document.addEventListener("keydown", function (evento) {
        if (evento.key === "Escape" && modalCadastro.classList.contains("aberto")) {
            fecharModalCadastro();
        }
    });
}

/* ===== VALIDAR E EXECUTAR CADASTRO NO BANCO DE DADOS ===== */
const formularioCadastro = document.getElementById("form-cadastro");
const mensagemCadastro = document.getElementById("cadastro-mensagem");

if (formularioCadastro && mensagemCadastro) {
    formularioCadastro.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const emailInput = document.getElementById("cadastro-email") || document.getElementById("email-cadastro");
        const senha = document.getElementById("cadastro-senha").value;
        const confirmarSenha = document.getElementById("cadastro-confirmar").value;
        const nomeInput = document.getElementById("cadastro-nome") || document.getElementById("nome-cadastro");

        const aceiteTermos = document.getElementById("aceite-termos");
        const aceitePrivacidade = document.getElementById("aceite-privacidade");

        if (aceiteTermos && aceitePrivacidade && (!aceiteTermos.checked || !aceitePrivacidade.checked)) {
            mensagemCadastro.style.color = "#ff8fa3";
            mensagemCadastro.textContent = "Aceite os Termos de Uso e confirme a leitura da Política de Privacidade.";
            return;
        }

        if (senha !== confirmarSenha) {
            mensagemCadastro.style.color = "#ff8fa3";
            mensagemCadastro.textContent = "As senhas não são iguais!";
            return;
        }

        const email = emailInput ? emailInput.value.trim() : "";
        const nome = nomeInput ? nomeInput.value.trim() : email.split("@")[0];

        mensagemCadastro.style.color = "#38bdf8";
        mensagemCadastro.textContent = "A registar conta no servidor...";

        try {
            const resposta = await fetch(`${API_BASE_URL}/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: email,
                    password: senha,
                    nome: nome
                })
            });

            if (!resposta.ok) {
                const erroServidor = await resposta.json();
                throw new Error(erroServidor.detail || "Erro ao criar conta no banco de dados.");
            }

            mensagemCadastro.style.color = "#7dffb3";
            mensagemCadastro.textContent = "Conta criada com sucesso! Redirecionando ou faça login...";
            
            setTimeout(() => {
                fecharModalCadastro();
                formularioCadastro.reset();
            }, 1500);

        } catch (erro) {
            console.error("Erro no registo:", erro);
            mensagemCadastro.style.color = "#ff8fa3";
            mensagemCadastro.textContent = "Erro: " + erro.message;
        }
    });
}

/* ===== EXECUÇÃO DO LOGIN COM JWT E BANCO DE DADOS ===== */
const formularioLogin = document.getElementById("login-form");
const mensagemLogin = document.getElementById("login-message");

if (formularioLogin && mensagemLogin) {
    formularioLogin.addEventListener("submit", async function (evento) {
        evento.preventDefault();

        const emailInput = document.getElementById("username") || document.getElementById("email") || document.getElementById("login-email");
        const senhaInput = document.getElementById("password") || document.getElementById("login-senha");

        const email = emailInput ? emailInput.value.trim() : "";
        const senha = senhaInput ? senhaInput.value : "";

        if (!email || !senha) {
            mensagemLogin.style.color = "#ff8fa3";
            mensagemLogin.textContent = "Preencha o utilizador/e-mail e a palavra-passe.";
            return;
        }

        mensagemLogin.style.color = "#38bdf8";
        mensagemLogin.textContent = "A autenticar com o banco de dados...";

        try {
            const formData = new URLSearchParams();
            formData.append("username", email);
            formData.append("password", senha);

            const resposta = await fetch(`${API_BASE_URL}/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: formData
            });

            if (!resposta.ok) {
                throw new Error("Credenciais inválidas ou utilizador não encontrado.");
            }

            const dados = await resposta.json();
            
            // GUARDAR ESTritamente NO sessionStorage (Isolado por aba, sem interferir com outras contas abertas)
            if (dados.access_token) {
                sessionStorage.setItem("ludaryumToken", dados.access_token);
                sessionStorage.setItem("ludaryumNome", email);
            }

            mensagemLogin.style.color = "#7dffb3";
            mensagemLogin.textContent = "Login efetuado com sucesso! A entrar no ecossistema...";

            setTimeout(() => {
                window.location.href = "/home-ui/home.html";
            }, 1000);

        } catch (erro) {
            console.error("Erro no login:", erro);
            mensagemLogin.style.color = "#ff8fa3";
            mensagemLogin.textContent = "Falha no login: verifique os seus dados.";
        }
    });
}

function nomeFromEmail(email) {
    if (!email) return "Utilizador";
    return email.split("@")[0];
}

/* ===== MOSTRAR E OCULTAR SENHA ===== */
const campoSenhaLogin = document.getElementById("password");
const botaoMostrarSenha = document.getElementById("toggle-password");

if (campoSenhaLogin && botaoMostrarSenha) {
    botaoMostrarSenha.addEventListener("click", function () {
        if (campoSenhaLogin.type === "password") {
            campoSenhaLogin.type = "text";
            botaoMostrarSenha.textContent = "OCULTAR";
        } else {
            campoSenhaLogin.type = "password";
            botaoMostrarSenha.textContent = "MOSTRAR";
        }
    });
}