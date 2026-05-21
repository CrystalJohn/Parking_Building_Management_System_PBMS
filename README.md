<a id="readme-top"></a>


<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h3 align="center">Parking Building Management System</h3>

  <p align="center">
    Hệ thống quản lý tòa nhà đỗ xe thông minh — tự động phân bổ slot, tính phí, đặt chỗ trước, và báo cáo vận hành.
    <br />
    <br />
    <a href="#getting-started">Bắt đầu</a>
    ·
    <a href="#usage">Sử dụng</a>
    ·
    <a href="#roadmap">Roadmap</a>
  </p>
</div>

<!-- TABLE OF CONTENTS -->
<details>
  <summary>Mục lục</summary>
  <ol>
    <li><a href="#about-the-project">About The Project</a></li>
    <li><a href="#built-with">Built With</a></li>
    <li><a href="#getting-started">Getting Started</a></li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#project-structure">Project Structure</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>

---

## About The Project

Hệ thống quản lý tòa nhà đỗ xe đa tầng, xử lý:

- **Check-in / Check-out** xe tại cổng (Staff thao tác qua web)
- **Smart Slot Allocation** — thuật toán phân bổ slot cân bằng tải giữa các tầng
- **Tính phí tự động** — làm tròn theo giờ, phụ thu overtime & mất vé
- **Đặt chỗ trước** (Reservation) cho Driver đã đăng ký
- **QR Code** — Driver nhận QR khi check-in, Staff scan QR khi check-out
- **Báo cáo** doanh thu, lưu lượng, occupancy cho Manager
- **Quản lý user & role** (Admin, Manager, Staff, Driver)

**Thông số tòa nhà:**
| | |
|---|---|
| Số tầng | 3 (T1, T2, T3) |
| Zone A (ô tô) | 10 slot/tầng → 30 slot |
| Zone B (xe máy) | 20 slot/tầng → 60 slot |
| Tổng | 90 slot |
| Cổng | 1 cổng, 2 lane (trái: ô tô, phải: xe máy) |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Built With

| Layer | Technology |
|-------|-----------|
| Backend | [![NestJS][NestJS-badge]][NestJS-url] |
| Frontend | [![React][React-badge]][React-url] [![Vite][Vite-badge]][Vite-url] |
| Database | [![PostgreSQL][Postgres-badge]][Postgres-url] |
| ORM | [![Prisma][Prisma-badge]][Prisma-url] |
| Styling | [![TailwindCSS][Tailwind-badge]][Tailwind-url] |
| Auth | JWT (passport-jwt) |
| Container | [![Docker][Docker-badge]][Docker-url] |
| Mobile (Phase 2) | React Native |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Docker** & **Docker Compose** (cho PostgreSQL + pgAdmin)

### Installation

1. **Clone repo**

   ```sh
   git clone https://github.com/<your-username>/parking-building-management.git
   cd parking-building-management
   ```

2. **Cài dependencies**

   ```sh
   npm install
   ```

3. **Tạo file `.env`**

   ```sh
   cp .env.example apps/api/.env
   ```

   Chỉnh sửa `JWT_SECRET` thành giá trị ngẫu nhiên:

   ```dotenv
   JWT_SECRET=your_strong_random_secret_here
   ```

4. **Khởi động PostgreSQL & pgAdmin**

   ```sh
   docker compose up -d
   ```

   - PostgreSQL: `localhost:5432`
   - pgAdmin: `http://localhost:5050` (login: `admin@parking.local` / `admin`)

5. **Chạy migration & seed**

   ```sh
   cd apps/api
   npx prisma migrate dev
   npx prisma db seed
   ```

6. **Khởi động backend**

   ```sh
   npm run dev --workspace=apps/api
   ```

   API chạy tại `http://localhost:3000`

7. **Khởi động frontend**

   ```sh
   npm run dev --workspace=apps/web
   ```

   Web chạy tại `http://localhost:5173`

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Usage

### Tài khoản mặc định (sau khi seed)

| Role | Phone | Password |
|------|-------|----------|
| Admin | `0900000001` | `admin123` |
| Manager | `0900000002` | `manager123` |
| Staff | `0900000003` | `staff123` |

### API Endpoints chính

| Method | Endpoint | Mô tả | Role |
|--------|----------|--------|------|
| POST | `/auth/login` | Đăng nhập | All |
| POST | `/auth/register` | Driver tự đăng ký | Public |
| GET | `/slots` | Danh sách slot | All (auth) |
| GET | `/slots/availability` | Số slot trống theo tầng/zone | All (auth) |
| POST | `/sessions/check-in` | Check-in xe | Staff |
| POST | `/sessions/check-out` | Check-out xe | Staff |
| GET | `/users` | Quản lý user | Admin |
| PATCH | `/slots/:id/status` | Đặt slot maintenance | Manager |

### Frontend Pages

| Path | Role | Chức năng |
|------|------|-----------|
| `/login` | All | Đăng nhập |
| `/staff/gate` | Staff | Check-in / Check-out |
| `/staff/lost-ticket` | Staff | Xử lý mất vé |
| `/manager/dashboard` | Manager | Bản đồ slot real-time |
| `/manager/reports` | Manager | Báo cáo doanh thu/lưu lượng |
| `/manager/config` | Manager | Cấu hình giá & slot |
| `/admin/users` | Admin | Quản lý tài khoản |
| `/driver/home` | Driver | Xem slot trống & giá |
| `/driver/reservations` | Driver | Đặt/hủy chỗ |

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Project Structure

```
parking-building-management/
├── apps/
│   ├── api/                    # NestJS Backend
│   │   ├── prisma/             # Schema, migrations, seed
│   │   └── src/
│   │       ├── auth/           # JWT, guards, decorators
│   │       ├── prisma/         # PrismaService (global)
│   │       ├── users/          # User CRUD (Admin)
│   │       ├── slots/          # Slot management + allocation
│   │       └── ...             # sessions, fees, reservations, reports, config
│   ├── web/                    # Vite + React + Tailwind
│   │   └── src/
│   │       ├── pages/          # Route pages by role
│   │       ├── components/     # Shared UI components
│   │       ├── lib/            # API client, auth utils
│   │       └── routes/         # React Router config
│   └── mobile/                 # React Native (Phase 2)
├── docker-compose.yml          # PostgreSQL + pgAdmin
├── .env.example                # Template env vars
└── package.json                # Workspace root
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Roadmap

- [x] Sprint 0 — Project Setup & Infrastructure
- [x] Sprint 1 — Foundation (Auth, Users, Slots, Sessions, Fees) *(in progress)*
- [ ] Sprint 2 — Reservations, QR Code, Lost Ticket, Driver Pages
- [ ] Sprint 3 — Reporting & Admin Config
- [ ] Sprint 4 — Research Support (Strategy Pattern, Simulation)
- [ ] Sprint 5 — Mobile App (React Native)

Xem chi tiết tại [tasks.md](.kiro/specs/parking-building-management/tasks.md).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feat/amazing-feature`)
3. Commit your Changes (`git commit -m 'Add some amazing feature'`)
4. Push to the Branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## License

Distributed under the MIT License.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Acknowledgments

- [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — README structure reference
- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Tailwind CSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

<!-- MARKDOWN LINKS & IMAGES -->
[contributors-shield]: https://img.shields.io/github/contributors/your-username/parking-building-management.svg?style=for-the-badge
[contributors-url]: https://github.com/your-username/parking-building-management/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/your-username/parking-building-management.svg?style=for-the-badge
[forks-url]: https://github.com/your-username/parking-building-management/network/members
[stars-shield]: https://img.shields.io/github/stars/your-username/parking-building-management.svg?style=for-the-badge
[stars-url]: https://github.com/your-username/parking-building-management/stargazers
[issues-shield]: https://img.shields.io/github/issues/your-username/parking-building-management.svg?style=for-the-badge
[issues-url]: https://github.com/your-username/parking-building-management/issues

[NestJS-badge]: https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white
[NestJS-url]: https://nestjs.com/
[React-badge]: https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB
[React-url]: https://reactjs.org/
[Vite-badge]: https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white
[Vite-url]: https://vitejs.dev/
[Postgres-badge]: https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white
[Postgres-url]: https://www.postgresql.org/
[Prisma-badge]: https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white
[Prisma-url]: https://www.prisma.io/
[Tailwind-badge]: https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white
[Tailwind-url]: https://tailwindcss.com/
[Docker-badge]: https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white
[Docker-url]: https://www.docker.com/
