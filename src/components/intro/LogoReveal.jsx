export default function LogoReveal({ visible, logoSrc = '/brand/da-dino-logo.png' }) {
  return (
    <div className={`cinema-logo-reveal${visible ? ' visible' : ''}`} aria-label="DINO CLOTHING">
      <div className="cinema-logo-line" />
      <div className="cinema-logo-art">
        <img src={logoSrc} alt="Dinosaur emblem" />
      </div>
      <div className="cinema-logo-wordmark" aria-label="DINO CLOTHING">
        <strong>DINO</strong>
        <span>CLOTHING</span>
      </div>
      <p>BUILT FOR THE WILD</p>
    </div>
  )
}
