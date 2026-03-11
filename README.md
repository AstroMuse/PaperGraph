# PaperGraph

*English | [简体中文](#简体中文)*

PaperGraph is a web-based, interactive tool designed to construct and manage interconnected knowledge graphs of academic papers. It features a multi-project workspace environment allowing users to isolate their research, automatically parsing uploaded PDF documents and establishing intuitive visual nodes and links between related research contexts.

## Development Highlights & Open Source Notes

The project aims to be simple and maintainable. Built using standard, lightweight web technologies:
- **Frontend:** React + Vite + TailwindCSS for a fast, responsive interface.
- **Graph Visualization:** D3.js for rendering force-directed graphs.
- **Backend API:** Node.js Express server to handle uploads and metadata.
- **Database Layer:** Standard Redis for high-performance and easy-to-use persistence of project nodes, links, and documents.

### Potential Areas for Future Optimization (for Contributors)
The codebase is currently very lean and well-structured, but as an open-source project, here are some areas where community contributions or future iterations might focus:
1. **PDF Parsing & Text Extraction:** Currently, PDFs are uploaded and stored, but full-text extraction/indexing (e.g., using `pdf.js` or Python-based extractors on the backend) could automatically generate summary tags or suggest links based on semantic similarity using a vector database (like Chroma or Pinecone).
2. **TypeScript Migration on Backend:** The frontend leverages TypeScript (`App.tsx`), but the backend (`server.js`) is vanilla JavaScript. Migrating the backend to TypeScript would improve type safety for API contracts.
3. **Authentication & Multi-user:** The current setup is designed for a single local user. Adding an auth layer (e.g., JWT, NextAuth/Auth.js) would make it viable as a hosted SaaS product.
4. **Graph Performance with Large Datasets:** For graphs exceeding thousands of nodes, D3's force simulation might lag. Implementing WebGL-based rendering (like `react-force-graph` or `vis.js`) or clustering algorithms could significantly optimize rendering on huge projects.

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18+)
- Redis Server (Running on default port `6379`. Windows users can run via WSL `redis-server` or install Memurai)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/AstroMuse/paperGraph.git
   cd paperGraph
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   Create a `.env` file in the root directory based on `.env.example`.
   *(Requires your Gemini API key if using AI integrations)*

4. Start the application:
   ```bash
   # Starts both Vite frontend and Express backend concurrently
   npm run dev:all
   ```

5. Open your browser and navigate to the frontend URL (usually `http://localhost:3000`).

## 📁 File Structure

- `server.js` - Express backend, Redis connection, and API routes.
- `src/` - React frontend code, components, and hooks.
- `uploads/` - Local directory where uploaded PDF papers are stored.

## 📄 License
[MIT License](LICENSE)

<br/>
<hr/>
<br/>

# 简体中文

*[English](#papergraph) | 简体中文*

PaperGraph 是一款基于 Web 的交互式工具，旨在构建和管理学术论文之间互相关联的知识图谱。它具备多项目工作区环境，允许用户隔离不同的研究课题，并且能够自动处理上传的 PDF 文档，在相关的研究背景之间建立直观的视觉节点和连线。

## 开发亮点与开源说明

该项目致力于保持轻量和易维护，使用了标准且轻量级的 Web 技术栈：
- **前端:** React + Vite + TailwindCSS 打造快速、响应式的用户界面。
- **图谱渲染:** D3.js 用于渲染力导向图 (force-directed graphs)。
- **后端 API:** Node.js Express 提供接口以处理上传和元数据。
- **数据库层:** 标准的 Redis，能够高性能、易用地持久化存储各个项目下的节点、连线和文档信息。

### 未来的优化方向 (致贡献者)
目前的代码库非常精简且结构清晰。作为开源项目，未来的社区贡献和版本迭代可以重点关注以下领域：
1. **PDF 深度解析与文本提取:** 目前项目仅对 PDF 进行上传和基础存储。未来可在后端引入全文提取/索引功能（如 `pdf.js` 或基于 Python 的提取工具），甚至整合向量数据库（比如 Chroma 或 Pinecone）根据语义计算自动生成摘要标签或建议论文之间的连线。
2. **后端 TypeScript 迁移:** 前端已经采用了 TypeScript (`App.tsx`)，但后端 (`server.js`) 还是纯 JavaScript。将后端迁移到 TypeScript 会为 API 契约提供更好的类型安全保障。
3. **账户与多用户鉴权系统:** 当前的设计更适合单机本地运行。如果计划发展成受托管的 SaaS 产品，可以通过 JWT 或 NextAuth/Auth.js 添加鉴权层。
4. **渲染超大数据集时的性能提升:** 当图谱节点达到数千个以上，D3 的力导向模拟计算可能会出现卡顿。引入基于 WebGL 的渲染方案（例如 `react-force-graph` 或 `vis.js`）或节点聚类算法，能极大优化巨型图谱下的渲染性能。

---

## 🚀 本地运行指南

### 环境要求
- Node.js (v18+)
- Redis Server (需在默认端口 `6379` 运行。Windows 用户可通过 WSL 运行 `redis-server` 或安装 Memurai)

### 安装步骤

1. 克隆项目仓库：
   ```bash
   git clone https://github.com/AstroMuse/paperGraph.git
   cd paperGraph
   ```

2. 安装依赖包：
   ```bash
   npm install
   ```

3. 配置环境变量：
   根据根目录下的 `.env.example` 文件创建 `.env` 文件。
   *(如果需要使用 AI 整合功能，需填入您的 Gemini API 密钥)*

4. 启动应用：
   ```bash
   # 一键同时启动 Vite 前端服务和 Express 后端服务
   npm run dev:all
   ```

5. 打开浏览器，访问前端地址 (通常为 `http://localhost:3000`)。

## 📁 主要文件结构

- `server.js` - Express 后端主逻辑、Redis 连接池以及 API 路由。
- `src/` - React 前端代码、组件和 Hooks。
- `uploads/` - 本地存放用户上传的 PDF 论文的专用目录。

## 📄 开源许可证
[MIT License](LICENSE)
