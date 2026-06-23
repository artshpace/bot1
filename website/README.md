# Shpigotskiy Art Space — Сайт

Маркетинговый сайт студии творческого развития. Чистый HTML/CSS/JS — сборка не требуется.

---

## Структура проекта

```
bot1/
├── index.html              # Telegram Mini App (не трогать)
├── media/                  # Медиафайлы (фото)
│   ├── acting/
│   ├── guitar/
│   ├── teachers/
│   └── shpigotskiy.jpg
└── website/                # Сайт (эта папка)
    ├── index.html          # Главная страница
    ├── teachers.html
    ├── events.html
    ├── courses.html
    ├── contacts.html
    ├── offer.html
    ├── directions/
    │   ├── index.html      # Все направления
    │   ├── guitar.html
    │   ├── vocals.html
    │   ├── painting.html
    │   ├── acting.html
    │   └── dance.html
    ├── css/
    │   └── style.css
    └── js/
        └── main.js
```

---

## Зависимости

**Никаких** — браузер и любой локальный HTTP-сервер.

> Важно: открывать файлы через `file://` нельзя — шрифты Google Fonts и относительные пути к изображениям требуют HTTP-сервера.

---

## Запуск локально

Запускать сервер нужно из **корня репозитория** (`bot1/`), а не из папки `website/`. Иначе пути к изображениям (`../media/`) не разрешатся.

### Вариант 1 — Python (рекомендуется, есть на macOS/Linux)

```bash
cd /путь/к/bot1
python3 -m http.server 8000
```

Открыть в браузере: [http://localhost:8000/website/](http://localhost:8000/website/)

### Вариант 2 — Node.js (npx serve)

```bash
cd /путь/к/bot1
npx serve . -p 8000
```

Открыть: [http://localhost:8000/website/](http://localhost:8000/website/)

### Вариант 3 — VS Code Live Server

1. Установить расширение **Live Server** (Ritwick Dey).
2. Открыть папку `bot1/` в VS Code.
3. Правый клик на `website/index.html` → **Open with Live Server**.
4. Сервер запустится от корня репозитория автоматически.

### Вариант 4 — Node.js (http-server)

```bash
npm install -g http-server
cd /путь/к/bot1
http-server . -p 8000
```

---

## Страницы

| URL | Файл |
|-----|------|
| `/website/` | `website/index.html` |
| `/website/directions/` | `website/directions/index.html` |
| `/website/directions/guitar.html` | Гитара |
| `/website/directions/vocals.html` | Вокал |
| `/website/directions/painting.html` | Живопись |
| `/website/directions/acting.html` | Актёрское |
| `/website/directions/dance.html` | Танцы |
| `/website/teachers.html` | Преподаватели |
| `/website/events.html` | Мероприятия |
| `/website/courses.html` | Онлайн-курсы |
| `/website/contacts.html` | Контакты |
| `/website/offer.html` | Публичная оферта |

---

## Исправленные ошибки (v0.1.1)

| Файл | Проблема | Решение |
|------|----------|---------|
| `directions/*.html` | Пути к фото `../media/` указывали на несуществующую `website/media/` | Изменено на `../../media/` |
| `teachers.html` | Путь `media/shpigotskiy.jpg` указывал на `website/media/` | Изменено на `../media/shpigotskiy.jpg` |
| `courses.html` | Кнопки имели и `data-modal`, и `onclick="setCourse()"` — модальное окно открывалось дважды | Удалён атрибут `data-modal` |
