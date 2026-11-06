import { Shell } from './tiffin/Shell'
import { useRoute } from './tiffin/route'
import { FundProvider } from './tiffin/useFund'
import { WalletProvider } from './tiffin/wallet'
import { ActivityPage } from './tiffin/pages/Activity'
import { FundPage } from './tiffin/pages/Fund'
import { HowPage } from './tiffin/pages/How'
import { Landing } from './tiffin/pages/Landing'
import { TradePage } from './tiffin/pages/Trade'

function Routes() {
  const route = useRoute()
  if (route === 'landing') return <Landing />
  return (
    <Shell route={route}>
      {route === 'fund' && <FundPage />}
      {route === 'trade' && <TradePage />}
      {route === 'activity' && <ActivityPage />}
      {route === 'how' && <HowPage />}
    </Shell>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <FundProvider>
        <Routes />
      </FundProvider>
    </WalletProvider>
  )
}
