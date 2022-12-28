const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("NFT Marketplace Unit Tests", () => {
          let nftMarketplace, basicNft, deployer, buyer, seller
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0

          beforeEach(async () => {
              const accounts = await ethers.getSigners()
              deployer = accounts[0]
              buyer = accounts[1]
              seller = accounts[2]
              await deployments.fixture(["all"])
              nftMarketplaceContract = await ethers.getContract("NftMarketplace")
              nftMarketplace = nftMarketplaceContract.connect(deployer)
              basicNftcontract = await ethers.getContract("BasicNft")
              basicNft = basicNftcontract.connect(seller)
              // make basic nft
              await basicNft.mintNft()
              await basicNft.approve(nftMarketplace.address, TOKEN_ID)
          })

          describe("listItem", () => {
              it("emits an event after listing an item", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  expect(await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit(
                      "ItemListed"
                  )
              })

              it("won't let you list an item twice", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const error = `NftMarketplace__AlreadyListed("${basicNft.address}", ${TOKEN_ID})`
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith(error)
              })

              it("only allows the owner to list an item", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(buyer)
                  await basicNft.approve(buyer.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })

              it("needs approvals to list item", async () => {
                  await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotApprovedForMarketplace")
              })

              it("lists item with right seller and price", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == PRICE.toString())
                  assert(listing.seller.toString() == seller.address)
              })
          })

          describe("buyItem", () => {
              it("reverts if the item isn't listed", async () => {
                  await expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__NotListed")
              })
              it("reverts if the price isn't met", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__PriceNotMet")
              })
              it("transfers the nft to the buyer and updates the seller's proceeds", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(buyer)
                  await expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  ).to.emit(nftMarketplace, "ItemBought")
                  const newOwner = await basicNft.ownerOf(TOKEN_ID)
                  assert(newOwner.toString() == buyer.address)
                  const sellerProceeds = await nftMarketplace.getProceeds(seller.address)
                  assert(sellerProceeds.toString() == PRICE.toString())
              })
          })

          describe("cancelItem", async () => {
              // cancel item
              // get listing (should be null)
              it("reverts if there is no listing", async () => {
                  const error = `NftMarketplace__NotListed("${basicNft.address}", ${TOKEN_ID})`
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith(error)
              })
              it("reverts if anyone but the owner tries to cancel listing", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(buyer)
                  await basicNft.approve(buyer.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("emtis event and removes the listing", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)).to.emit(
                      "ItemCancelled"
                  )
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == "0")
              })
          })

          describe("updateListing", async () => {
              it("must be listed", async () => {
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotListed")
              })
              it("only owner can update it", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(buyer)
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace__NotOwner")
              })
              it("updates the price of the item", async () => {
                  const updatedPrice = ethers.utils.parseEther("0.2")
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, updatedPrice)
                  ).to.emit(nftMarketplace, "ItemListed")
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert(listing.price.toString() == updatedPrice.toString())
              })
          })

          describe("withdrawProceeds", async () => {
              it("doesn't allow 0 proceeds withdrawals", async () => {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                      "NftMarketplace__NoProceeds"
                  )
              })
              it("withdraws proceeds", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(buyer)
                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, { value: PRICE })
                  nftMarketplace = nftMarketplaceContract.connect(seller)
                  const sellerProceedsBefore = await nftMarketplace.getProceeds(seller.address)
                  const sellerBalanceBefore = await seller.getBalance()
                  const txResponse = await nftMarketplace.withdrawProceeds()
                  const txReceipt = await txResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = txReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)
                  const sellerBalanceAfter = await seller.getBalance()
                  assert(
                      sellerBalanceAfter.add(gasCost).toString() ==
                          sellerProceedsBefore.add(sellerBalanceBefore).toString()
                  )
              })
          })
      })
