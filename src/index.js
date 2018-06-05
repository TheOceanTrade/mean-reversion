import createOcean from 'the-ocean'
import Web3 from 'web3'

let position = 'out'
let direction = 'short'

const update = async () => {
  const web3Url = process.env.WEB3_URL || 'http://localhost:8545'
  const provider = new Web3.providers.HttpProvider(web3Url)

  let ocean = await createOcean({
    api: {
      key: process.env.OCEAN_API_KEY,
      secret: process.env.OCEAN_API_SECRET,
      baseURL: 'https://api.staging.theocean.trade/api/v0'
    },
    web3Provider: provider
  })

  const pairs = await ocean.marketData.tokenPairs()
  const myPair = pairs[0]
  const Q = 5

  // Get historical price data for the period of time that we
  // are taking the moving average over
  const startTime = parseInt(Date.now() / 1000 - 3600 * (Q + 1))
  const endTime = parseInt((Date.now() / 1000) - 10)
  const interval = 3600
  const candlesticks = await ocean.marketData.candlesticks({
    baseTokenAddress: myPair.baseToken.address,
    quoteTokenAddress: myPair.quoteToken.address,
    startTime,
    endTime,
    interval
  })

  // Calculate the moving average for this moment in time
  let sum = 0
  for (let i = 1; i < Q + 1; i++) {
    sum = sum + parseFloat(candlesticks[candlesticks.length - i].close)
  }
  const movingAverage = sum / Q

  // Calculate the variance and standard deviation for this moment in time
  let sumSquareDiff = 0
  for (let i = 1; i < Q + 1; i++) {
    sumSquareDiff = sumSquareDiff + (parseFloat(candlesticks[candlesticks.length - i].close) - movingAverage) ** 2
  }
  const variance = sumSquareDiff / Q
  const stdDev = Math.sqrt(variance)

  // Set risk tolerence levels
  const PositionBand = stdDev
  const StopLossLevel = 2 * PositionBand

  // Get the last trading price
  const ticker = await ocean.marketData.ticker({
    baseTokenAddress: myPair.baseToken.address,
    quoteTokenAddress: myPair.quoteToken.address
  })
  const last = ticker.last

  // Compare if last price is overvalued and too high away from the average - in this case, want to sell aka go short
  if (last > movingAverage + PositionBand && position === 'out') {
    const quoteBalance = await ocean.wallet.getTokenBalance({
      etherAddress: process.env.BOT_ADDRESS,
      tokenAddress: myPair.quoteToken.address
    })

    const baseAmount = quoteBalance.div(last).times(0.95) // Approximation for maximum amount can trade

    console.log(await ocean.trade.newMarketOrder({
      baseTokenAddress: myPair.baseToken.address,
      quoteTokenAddress: myPair.quoteToken.address,
      side: 'sell',
      orderAmount: baseAmount,
      feeOption: 'feeInNative'
    }))
    position = 'in'
    direction = 'short'
  }
  // Compare if last price is undervalued and too low away from the average - in this case, want to buy aka go long
  if (last < movingAverage - PositionBand && position === 'out') {
    const quoteBalance = await ocean.wallet.getTokenBalance({
      etherAddress: process.env.BOT_ADDRESS,
      tokenAddress: myPair.quoteToken.address
    })

    const baseAmount = quoteBalance.div(last).times(0.95)

    console.log(await ocean.trade.newMarketOrder({
      baseTokenAddress: myPair.baseToken.address,
      quoteTokenAddress: myPair.quoteToken.address,
      side: 'buy',
      orderAmount: baseAmount,
      feeOption: 'feeInNative'
    }))
    position = 'in'
    direction = 'long'
  }

  // Exit clause if currently in short position
  if (direction === 'short') {
    // Short price has mean reverted and can take profit on position
    if (last < movingAverage && position === 'in') {
      const quoteBalance = await ocean.wallet.getTokenBalance({
        etherAddress: process.env.BOT_ADDRESS,
        tokenAddress: myPair.quoteToken.address
      })

      const baseAmount = quoteBalance.div(last).times(0.95)

      console.log(await ocean.trade.newMarketOrder({
        baseTokenAddress: myPair.baseToken.address,
        quoteTokenAddress: myPair.quoteToken.address,
        side: 'buy',
        orderAmount: baseAmount,
        feeOption: 'feeInNative'
      }))
      position = 'out'
      direction = 'none'
    }
    // Short price has gone even higher from mean and can need to stop loss on position
    if (last > movingAverage + StopLossLevel && position === 'in') {
      const quoteBalance = await ocean.wallet.getTokenBalance({
        etherAddress: process.env.BOT_ADDRESS,
        tokenAddress: myPair.quoteToken.address
      })

      const baseAmount = quoteBalance.div(last).times(0.95)

      console.log(await ocean.trade.newMarketOrder({
        baseTokenAddress: myPair.baseToken.address,
        quoteTokenAddress: myPair.quoteToken.address,
        side: 'buy',
        orderAmount: baseAmount,
        feeOption: 'feeInNative'
      }))
      position = 'out'
      direction = 'none'
    }
  }
  // Exit clause if currently in long position
  if (direction === 'long') {
    // Long price has mean reverted and can take profit on position
    if (last > movingAverage && position === 'in') {
      const quoteBalance = await ocean.wallet.getTokenBalance({
        etherAddress: process.env.BOT_ADDRESS,
        tokenAddress: myPair.quoteToken.address
      })

      const baseAmount = quoteBalance.div(last).times(0.95)

      console.log(await ocean.trade.newMarketOrder({
        baseTokenAddress: myPair.baseToken.address,
        quoteTokenAddress: myPair.quoteToken.address,
        side: 'sell',
        orderAmount: baseAmount,
        feeOption: 'feeInNative'
      }))
      position = 'out'
      direction = 'none'
    }
    // Long price has gone even lower from mean and need to stop loss on position
    if (last < movingAverage - StopLossLevel && position === 'in') {
      const quoteBalance = await ocean.wallet.getTokenBalance({
        etherAddress: process.env.BOT_ADDRESS,
        tokenAddress: myPair.quoteToken.address
      })

      const baseAmount = quoteBalance.div(last).times(0.95)

      console.log(await ocean.trade.newMarketOrder({
        baseTokenAddress: myPair.baseToken.address,
        quoteTokenAddress: myPair.quoteToken.address,
        side: 'sell',
        orderAmount: baseAmount,
        feeOption: 'feeInNative'
      }))
      position = 'out'
      direction = 'none'
    }
  }
}

// run the update once per hour
setInterval(update, 3600 * 1000)
