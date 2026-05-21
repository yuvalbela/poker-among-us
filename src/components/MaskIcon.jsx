export default function MaskIcon({ className = '', style = {} }) {
  return (
    <img
      src="/mask.png"
      alt=""
      className={className}
      style={{ display: 'block', ...style }}
      draggable={false}
    />
  )
}
