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
    ├── account/            # Личный кабинет ученика (v0.2)
    │   ├── login.html      # Вход
    │   ├── register.html   # Регистрация
    │   ├── recover.html    # Восстановление доступа
    │   ├── dashboard.html  # Главная кабинета
    │   ├── courses.html    # Мои курсы
    │   └── schedule.html   # Календарь занятий
    ├── css/
    │   ├── style.css       # Дизайн-система публичного сайта
    │   └── account.css     # Стили кабинета (v0.2)
    └── js/
        ├── main.js         # Скрипты публичного сайта
        ├── api.js          # Моковый API-слой (v0.2)
        ├── auth.js         # Защита маршрутов + сессия (v0.2)
        └── account.js      # Логика страниц кабинета (v0.2)
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
| `/website/account/login.html` | Вход в кабинет (v0.2) |
| `/website/account/dashboard.html` | Личный кабинет (v0.2) |
| `/website/account/schedule.html` | Расписание / календарь (v0.2) |
| `/website/account/courses.html` | Мои курсы (v0.2) |

---

## Личный кабинет (v0.2)

Система авторизации и личный кабинет ученика. Реализованы:

- **Авторизация:** регистрация по телефону или email, вход, восстановление доступа, защищённые маршруты (редирект на вход для неавторизованных).
- **Кабинет ученика:** имя, направление, преподаватель, дата ближайшего занятия, расписание на неделю, остаток занятий, срок абонемента, статус оплаты.
- **Мои курсы:** список приобретённых онлайн-курсов с прогрессом в процентах и кнопкой перехода.
- **Расписание:** календарное отображение занятий по месяцам с детализацией дня.

### Демо-доступ

Без регистрации можно войти под демо-аккаунтом:

```
Логин:  demo@shpigotskiy.art
Пароль: demo1234
```

### Как это устроено (важно для интеграции)

> Реального бэкенда нет — используются **моковые данные и mock-API** на стороне браузера.

- `js/api.js` — единственная точка доступа к данным. Все страницы вызывают `window.API.*`, который сейчас возвращает Promise с тестовыми данными и хранит пользователей/сессию в `localStorage` (`sas_users`, `sas_session`). Когда появится настоящий backend — меняется **только этот файл** (методы заменяются на `fetch(...)`), код страниц трогать не нужно.
- `js/auth.js` — защита маршрутов и управление сессией. Подключается до `account.js`, выполняется немедленно: неавторизованных перенаправляет на `login.html`.
- `js/account.js` — логика всех страниц кабинета (один файл, секции выполняются только при наличии нужных элементов).
- `css/account.css` — стили кабинета, переиспользуют переменные из `style.css`.

### Архитектура на будущее (НЕ реализовано в v0.2)

Заготовлены, но намеренно не реализованы — добавляются в v0.3:

- **Родительский кабинет** — зарезервирован `API.parent`, в меню помечен «v0.3».
- **Домашние задания** — зарезервирован `API.homework`, в меню помечен «v0.3».
- **Сертификаты** — зарезервирован `API.certificates`, в меню помечен «v0.3».
- **Telegram Mini App** — модель пользователя (`role`, единый mock-API) совместима с будущей авторизацией через Telegram; сам Mini App живёт отдельно в `bot1/index.html`.

Эти разделы видны в боковом меню кабинета с пометкой «Скоро», их методы в `api.js` сейчас возвращают понятную ошибку-заглушку.

---

## Исправленные ошибки (v0.1.1)

| Файл | Проблема | Решение |
|------|----------|---------|
| `directions/*.html` | Пути к фото `../media/` указывали на несуществующую `website/media/` | Изменено на `../../media/` |
| `teachers.html` | Путь `media/shpigotskiy.jpg` указывал на `website/media/` | Изменено на `../media/shpigotskiy.jpg` |
| `courses.html` | Кнопки имели и `data-modal`, и `onclick="setCourse()"` — модальное окно открывалось дважды | Удалён атрибут `data-modal` |
