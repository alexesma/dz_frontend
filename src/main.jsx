import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Статические message.*, Modal.confirm и notification.* в antd v5 рисуются
// через ReactDOM.render, которого в React 19 больше нет: вызов проходит без
// исключения и не показывает ничего. Из-за этого весь фронтенд молчал —
// форма не сохранялась, а причина не выводилась. Патч переводит статику на
// createRoot и должен подключаться раньше самого antd.
import '@ant-design/v5-patch-for-react-19'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
    <App />
)
