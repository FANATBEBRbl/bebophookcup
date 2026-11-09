# Новый Windows-сервер

1. Установить Git for Windows и Steam/Deadlock. Нужна совместимая с Modlock 0.1.73 версия игры. Будущие обновления совместимость не гарантируют; для точного восстановления использовать копию старого VPS.
2. Скачать distributions/Bebop-Server-Tools.zip кнопкой Download raw file и распаковать в `C:\BebopServer`. Должны появиться `modlock.exe` и `runtime\node.exe`.
3. Клонировать репозиторий:

```powershell
git clone --branch dev https://github.com/FANATBEBRbl/bebophookcup C:\BebopServer\repo
```

4. Создать `C:\BebopServer\Start.cmd`, указав свой DEADLOCK_DIR:

```bat
@echo off
set "BEBOP_SERVER=C:\BebopServer"
set "DEADLOCK_DIR=C:\Program Files (x86)\Steam\steamapps\common\Deadlock"
set "PATH=C:\BebopServer\runtime;%PATH%"
set "BEBOP_REF=deployment-2026-11-09"
"C:\BebopServer\runtime\node.exe" "C:\BebopServer\repo\deploy\server.cjs"
pause
```

5. Запустить батник. Первый запуск требует интернета для загрузки нативного host своей версии Modlock. Updater собирает скрипт и копирует карту. Не запускать старый updater/share.cjs параллельно.
6. Настроить доступ к игровому порту 27067 и HUD TCP 4321 в Firewall и панели VPS. Проверить фактический игровой порт в выводе Modlock.
7. Раздать Bebop-Player.zip, сообщить новый адрес для server.txt. Проверить двумя игроками подключение, HUD, ready, несколько раундов и повторный вход.

BEBOP_REF фиксирует архивную версию. Для автообновления origin/dev убрать переменную. После изменения deploy/server.cjs обновить основной клон через git pull и перезапустить батник.

ZIP программ не включает Steam, игру, нативный host и системные компоненты Windows. Полностью офлайн-восстановление выполняется через [резервную копию](RECOVERY.md).
