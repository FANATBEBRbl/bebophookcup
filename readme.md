# Bebop Hook Arena / Bebop Cup

Архивная сборка турнира Deadlock на **Modlock 0.1.73**, Windows x64. Случайный краш сервера `0xc0000005` пока не устранён.

## Игрокам

Скачать [Bebop-Player.zip](distributions/Bebop-Player.zip) кнопкой **Download raw file**, распаковать, указать адрес сервера в `server.txt` и запустить `Start HUD.cmd`. Внутри: карта, HUD, portable Node.js с лицензией и инструкция. Steam и Deadlock устанавливаются отдельно. Окно батника оставлять открытым.

Исходники — [guest-hud](guest-hud). Для пересборки комплекта:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\Build-PlayerKit.ps1 -Runtime C:\PlayerKit\runtime
```

## Сервер

- [Режим](main.ts), [раунды](rounds.ts), [бой](combat.ts), [конфигурация](mod.json).
- [Карта](maps/bebop_arena_small.vpk), [исходники карты и материалов](map-source).
- [Запуск и обновление](deploy/server.cjs), [поток HUD](deploy/hud-feed.cjs).
- [Modlock и Node.js для сервера](distributions/Bebop-Server-Tools.zip).
- **[Развёртывание](deploy/SETUP.md)**.
- **[Резервирование и восстановление](deploy/RECOVERY.md)**.
- **[Диагностика](deploy/DIAGNOSTICS.md)**.

Игра и SDK в Git не включены. Для восстановления старой совместимой игры сохраните её с VPS по инструкции резервирования. Спавны не сохраняются.

`guest-hud/share.cjs` устарел: не запускать. Актуальный HUD обслуживает deploy/server.cjs.
