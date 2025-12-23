// ============================================================================
// FIREBASE КОНФИГУРАЦИЯ
// ============================================================================

const firebaseConfig = {
    apiKey: "AIzaSyA4oPWGm1n_efo-QReGHDvU9wQNl-3NoNY",
    authDomain: "ostroumnici.firebaseapp.com",
    projectId: "ostroumnici",
    storageBucket: "ostroumnici.firebasestorage.app",
    messagingSenderId: "1077647220616",
    appId: "1:1077647220616:web:66f05077ffd0a3ed22e43d"
}; // Липсваше затваряща скоба!

// Инициализиране на Firebase
let db;
try {
    // Първо провери дали Firebase вече е инициализиран
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    console.log("✅ Firebase готов");
    updateStatus("🟢 Свързан със сървъра", "safe");
} catch(e) {
    console.error("❌ Firebase грешка:", e);
    updateStatus("🔴 Офлайн режим - само локално", "error");
}

// ============================================================================
// ЗАЩИТНИ КОНФИГУРАЦИИ
// ============================================================================

const SECURITY = {
    MAX_POSTS_PER_HOUR: 10,
    MIN_POST_LENGTH: 3,
    MAX_POST_LENGTH: 500,
    VOTE_COOLDOWN: 30000,
    POST_COOLDOWN: 60000,
    BLOCKED_WORDS: ['http://', 'https://', '.com', '.bg', 'www.', 'спам', 'реклама', 'купи', 'продай']
};

let userActivity = {
    lastPostTime: 0,
    lastVoteTime: {},
    postCount: 0,
    resetTime: Date.now(),
    voteHistory: {}
};

// ============================================================================
// ОСНОВНИ ФУНКЦИИ
// ============================================================================

function updateStatus(message, type = "info") {
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
        statusBar.innerHTML = `<p>${message}</p>`;
        statusBar.className = `status-bar ${type}`;
    }
}

function showMessage(text, type = "info") {
    // Премахни стари съобщения
    const oldMessages = document.querySelectorAll('.custom-message');
    oldMessages.forEach(msg => msg.remove());
    
    // Създай ново съобщение
    const message = document.createElement('div');
    message.className = `custom-message ${type}`;
    message.textContent = text;
    
    message.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideInMessage 0.5s ease;
        background: ${type === 'success' ? '#4CAF50' : 
                    type === 'error' ? '#f44336' : 
                    type === 'warning' ? '#ff9800' : '#2196F3'};
    `;
    
    document.body.appendChild(message);
    
    // Автоматично премахване
    setTimeout(() => {
        message.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (document.body.contains(message)) {
                document.body.removeChild(message);
            }
        }, 300);
    }, 4000);
}

// ============================================================================
// ЗАЩИТНИ ФУНКЦИИ
// ============================================================================

function validateText(text) {
    if (typeof text !== 'string') {
        throw new Error('Невалиден текст');
    }
    
    const trimmed = text.trim();
    
    if (trimmed.length < SECURITY.MIN_POST_LENGTH) {
        throw new Error(`Напиши поне ${SECURITY.MIN_POST_LENGTH} символа`);
    }
    
    if (trimmed.length > SECURITY.MAX_POST_LENGTH) {
        throw new Error(`Не повече от ${SECURITY.MAX_POST_LENGTH} символа`);
    }
    
    // Проверка за блокирани думи
    const lowerText = trimmed.toLowerCase();
    for (const word of SECURITY.BLOCKED_WORDS) {
        if (lowerText.includes(word)) {
            throw new Error('Съдържа забранени елементи');
        }
    }
    
    return trimmed;
}

function checkPostLimits() {
    const now = Date.now();
    
    // Ресет на брояча всеки час
    if (now - userActivity.resetTime > 3600000) {
        userActivity.postCount = 0;
        userActivity.resetTime = now;
    }
    
    // Проверка за брой постове
    if (userActivity.postCount >= SECURITY.MAX_POSTS_PER_HOUR) {
        throw new Error(`Лимит: ${SECURITY.MAX_POSTS_PER_HOUR} поста/час`);
    }
    
    // Проверка за време между постове
    if (now - userActivity.lastPostTime < SECURITY.POST_COOLDOWN) {
        const remaining = Math.ceil((SECURITY.POST_COOLDOWN - (now - userActivity.lastPostTime)) / 1000);
        throw new Error(`Изчакай ${remaining} секунди`);
    }
    
    userActivity.lastPostTime = now;
    userActivity.postCount++;
    
    return true;
}

function checkVoteLimits(postId) {
    const now = Date.now();
    const lastVote = userActivity.voteHistory[postId] || 0;
    
    if (now - lastVote < SECURITY.VOTE_COOLDOWN) {
        const remaining = Math.ceil((SECURITY.VOTE_COOLDOWN - (now - lastVote)) / 1000);
        throw new Error(`Изчакай ${remaining} секунди за нов глас`);
    }
    
    userActivity.voteHistory[postId] = now;
    return true;
}

// ============================================================================
// ФУНКЦИИ ЗА ПОСТОВЕ
// ============================================================================

async function loadPosts() {
    try {
        if (!db) {
            throw new Error("Базата данни не е инициализирана");
        }
        
        const snapshot = await db.collection('posts')
            .orderBy('timestamp', 'desc')
            .limit(50)
            .get();
        
        const posts = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            posts.push({
                id: doc.id,
                ...data,
                timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
            });
        });
        
        displayPosts(posts);
        console.log(`✅ Заредени ${posts.length} поста`);
        
    } catch(e) {
        console.error("Грешка при зареждане:", e);
        showMessage("❌ Грешка при зареждане", "error");
        
        // Fallback
        const container = document.getElementById('postsContainer');
        container.innerHTML = `
            <div class="empty-state">
                <h3>🎭 Няма остроумия все още!</h3>
                <p>Бъди първият който ще сподели шега!</p>
            </div>
        `;
    }
}

function displayPosts(posts) {
    const container = document.getElementById('postsContainer');
    
    if (!posts || posts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>🎭 Няма остроумия все още!</h3>
                <p>Бъди първият който ще сподели шега!</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    posts.forEach(post => {
        const timeAgo = getTimeAgo(post.timestamp);
        const votes = post.votes || { funny: 0, smart: 0, love: 0 };
        
        html += `
            <div class="post">
                <div class="post-text">${escapeHtml(post.text)}</div>
                <div class="vote-buttons">
                    <button class="vote-btn funny" data-post-id="${post.id}" data-vote-type="funny">
                        😂 <span class="vote-count">${votes.funny}</span> Смешно
                    </button>
                    <button class="vote-btn smart" data-post-id="${post.id}" data-vote-type="smart">
                        🧠 <span class="vote-count">${votes.smart}</span> Умно
                    </button>
                    <button class="vote-btn love" data-post-id="${post.id}" data-vote-type="love">
                        ❤️ <span class="vote-count">${votes.love}</span> Харесва ми
                    </button>
                </div>
                <div class="post-meta">
                    <span>📅 ${timeAgo}</span>
                    <span>🎭 ${getCategoryName(post.category)}</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function submitPost() {
    try {
        // Проверки за защита
        checkPostLimits();
        
        const textElement = document.getElementById('postText');
        const categoryElement = document.getElementById('postCategory');
        
        if (!textElement || !categoryElement) {
            throw new Error('Формата не е заредена');
        }
        
        const rawText = textElement.value;
        const category = categoryElement.value;
        
        // Валидации
        const cleanText = validateText(rawText);
        
        const validCategories = ['joke', 'proverb', 'observation', 'other'];
        if (!validCategories.includes(category)) {
            throw new Error('Невалидна категория');
        }
        
        // Подготовка на поста
        const post = {
            text: cleanText,
            category: category,
            votes: { 
                funny: 0, 
                smart: 0, 
                love: 0 
            },
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            author: 'Анонимен'
        };
        
        // Запис в базата
        if (!db) {
            throw new Error("Базата данни не е достъпна");
        }
        
        await db.collection('posts').add(post);
        
        // Успешно публикуване
        document.getElementById('postForm').style.display = 'none';
        textElement.value = '';
        
        showMessage('✅ Постът е публикуван!', 'success');
        
        // Презареждане
        setTimeout(loadPosts, 1000);
        
    } catch (error) {
        console.error('Грешка:', error);
        showMessage(`❌ ${error.message}`, 'error');
    }
}

async function vote(postId, type) {
    try {
        if (!db) {
            throw new Error("Базата данни не е достъпна");
        }
        
        // Проверки
        checkVoteLimits(postId);
        
        const validTypes = ['funny', 'smart', 'love'];
        if (!validTypes.includes(type)) {
            throw new Error('Невалиден тип');
        }
        
        const postRef = db.collection('posts').doc(postId);
        const postDoc = await postRef.get();
        
        if (!postDoc.exists) {
            throw new Error('Постът не съществува');
        }
        
        // Използваме транзакция за безопасно обновяване
        await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(postRef);
            const data = freshDoc.data();
            const votes = data.votes || { funny: 0, smart: 0, love: 0 };
            
            if (typeof votes[type] !== 'number') {
                votes[type] = 0;
            }
            
            votes[type] += 1;
            
            // Лимит за гласове
            if (votes[type] > 10000) {
                votes[type] = 10000;
            }
            
            transaction.update(postRef, { 
                votes: votes,
                lastVoted: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            return votes[type];
        });
        
        // Анимация на бутона
        const button = document.querySelector(`.vote-btn[data-post-id="${postId}"][data-vote-type="${type}"]`);
        if (button) {
            animateVoteButton(button, type);
        }
        
        showMessage('✅ Гласът е отчетен!', 'success');
        
        // Обновяване само на конкретния пост
        updateVoteCount(postId, type);
        
    } catch (error) {
        console.error('Грешка при гласуване:', error);
        showMessage(`❌ ${error.message}`, 'error');
    }
}

// Помощна функция за обновяване на брояча
function updateVoteCount(postId, type) {
    const voteCountElement = document.querySelector(
        `.vote-btn[data-post-id="${postId}"][data-vote-type="${type}"] .vote-count`
    );
    
    if (voteCountElement) {
        const currentCount = parseInt(voteCountElement.textContent) || 0;
        voteCountElement.textContent = currentCount + 1;
    }
}

// ============================================================================
// ФУНКЦИИ ЗА ФОРМА
// ============================================================================

function showPostForm() {
    const form = document.getElementById('postForm');
    form.style.display = 'flex';
    
    // Фокус върху текстовото поле
    setTimeout(() => {
        document.getElementById('postText').focus();
    }, 100);
}

function hidePostForm() {
    document.getElementById('postForm').style.display = 'none';
    document.getElementById('postText').value = '';
}

// ============================================================================
// ПОМОЩНИ ФУНКЦИИ
// ============================================================================

function getCategoryName(category) {
    const categories = {
        'joke': 'Шега',
        'proverb': 'Поговорка',
        'observation': 'Наблюдение',
        'other': 'Друго'
    };
    return categories[category] || 'Друго';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(dateInput) {
    if (!dateInput) return 'неизвестно';
    
    let date;
    
    if (dateInput.toDate && typeof dateInput.toDate === 'function') {
        date = dateInput.toDate();
    } else if (typeof dateInput === 'string') {
        date = new Date(dateInput);
    } else if (typeof dateInput === 'number') {
        date = new Date(dateInput);
    } else {
        date = dateInput;
    }
    
    if (!date || isNaN(date.getTime())) return 'неизвестно';
    
    const now = new Date();
    const diffMs = now - date;
    
    if (diffMs < 0) return 'току-що';
    
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSec < 60) return 'току-що';
    if (diffMin < 60) return diffMin === 1 ? 'преди 1 минута' : `преди ${diffMin} минути`;
    if (diffHours < 24) return diffHours === 1 ? 'преди 1 час' : `преди ${diffHours} часа`;
    if (diffDays < 7) return diffDays === 1 ? 'преди 1 ден' : `преди ${diffDays} дни`;
    
    return date.toLocaleDateString('bg-BG');
}

function animateVoteButton(button, type) {
    if (!button) return;
    
    // Добави активен клас за анимация
    button.classList.add('active');
    
    // Ефект "скачане" на числата
    const voteCount = button.querySelector('.vote-count');
    if (voteCount) {
        voteCount.style.transform = 'scale(1.5)';
        setTimeout(() => {
            voteCount.style.transform = 'scale(1)';
        }, 300);
    }
    
    // Премахни активния клас след анимацията
    setTimeout(() => {
        button.classList.remove('active');
    }, 500);
}

// ============================================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Страницата е заредена");
    
    // Зареждане на постовете
    loadPosts();
    
    // Свързване на основните бутони
    const newPostBtn = document.getElementById('newPostBtn');
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    
    if (newPostBtn) newPostBtn.addEventListener('click', showPostForm);
    if (submitBtn) submitBtn.addEventListener('click', submitPost);
    if (cancelBtn) cancelBtn.addEventListener('click', hidePostForm);
    
    // Затваряне на формата при клик извън
    const postForm = document.getElementById('postForm');
    if (postForm) {
        postForm.addEventListener('click', function(e) {
            if (e.target === this) {
                hidePostForm();
            }
        });
    }
    
    // Делегиране на събития за гласуване
    const postsContainer = document.getElementById('postsContainer');
    if (postsContainer) {
        postsContainer.addEventListener('click', function(e) {
            // Намираме най-близкия бутон за гласуване
            const voteBtn = e.target.closest('.vote-btn');
            if (voteBtn) {
                const postId = voteBtn.getAttribute('data-post-id');
                const type = voteBtn.getAttribute('data-vote-type');
                if (postId && type) {
                    vote(postId, type);
                }
            }
        });
    }
    
    // Клавишни комбинации
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hidePostForm();
        }
        
        // Ctrl/Cmd + Enter за публикуване
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            if (postForm && postForm.style.display === 'flex') {
                submitPost();
            }
        }
    });
    
    // Автоматично презареждане на всеки 30 секунди
    setInterval(loadPosts, 30000);
    
    console.log("✅ Системата е готова!");
});