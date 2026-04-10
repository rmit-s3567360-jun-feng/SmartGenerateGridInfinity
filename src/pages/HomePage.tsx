import { Link } from 'react-router-dom'

import { TemplateCard } from '../components/TemplateCard'
import { templateCatalog } from '../lib/gridfinity/templateCatalog'

export function HomePage() {
  return (
    <main className="landing-page">
      <section className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">Gridfinity Model Generator</p>
          <h1>用参数直接生成可打印的 Gridfinity 收纳模型</h1>
          <p className="hero__copy">
            选择模板、调尺寸、实时预览并导出 STL / 3MF。首版聚焦最常用的
            Gridfinity bin 变体，覆盖通用盒体、参数化型腔盒、内存卡托盘、照片轮廓收纳、STL 型腔收纳和 STL 改底适配。
          </p>
          <div className="hero__actions">
            <Link className="button" to="/generator/generic-bin">
              立即开始
            </Link>
            <a className="button button--ghost" href="#templates">
              查看模板
            </a>
          </div>
        </div>
        <div className="hero__panel">
          <div className="spec-chip">
            <strong>42mm</strong>
            <span>标准 XY 节距</span>
          </div>
          <div className="spec-chip">
            <strong>7mm</strong>
            <span>标准高度单位</span>
          </div>
          <div className="spec-chip">
            <strong>6 x 2mm</strong>
            <span>可选磁铁孔规格</span>
          </div>
          <div className="hero__note">
            所有模型默认按毫米构建，导出的 STL / 3MF 可直接导入常见切片软件。
          </div>
        </div>
      </section>

      <section className="template-section" id="templates">
        <div className="section-heading">
          <p className="panel__eyebrow">模板库</p>
          <h2>先用六种高频收纳场景切入</h2>
          <p>现在已扩展为六种工作流，包含独立的参数化型腔盒、STL 型腔收纳和现成 STL 改底到 Gridfinity 的适配入口。</p>
          <p>
            模板都是配置驱动的。后续要加底板、盖子或新工具类型时，只需要新增
            schema、字段描述和建模函数。
          </p>
        </div>
        <div className="template-grid">
          {templateCatalog.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </section>

      <section className="info-strip">
        <div>
          <strong>纯前端生成</strong>
          <span>浏览器内完成参数化建模与 STL / 3MF 导出</span>
        </div>
        <div>
          <strong>中文界面</strong>
          <span>首版围绕中文参数说明和模板引导构建</span>
        </div>
        <div>
          <strong>桌面优先</strong>
          <span>移动端可浏览和简单调参，但主要为桌面建模优化</span>
        </div>
      </section>
    </main>
  )
}
