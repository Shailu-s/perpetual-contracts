import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { initial } from "lodash";

describe("Parent Token", function(){
  let VolmexBaseToken
  let volmexBaseToken
  let IndexPriceOracle
  let indexPriceOracle
  let owner, account1,account2
  this.beforeAll(async() => {
      VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
      IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
  })
  beforeEach(async()=>{
    [owner, account1,account2] = await ethers.getSigners();
    indexPriceOracle = await upgrades.deployProxy(
        IndexPriceOracle,
        [
         owner.address,
        ],
        {
         initializer : "initialize"   
    })
   
	  volmexBaseToken = await upgrades.deployProxy(
			VolmexBaseToken,
			[
				"MyTestToken",
				"MKT",
				indexPriceOracle.address,
				true
	  	],
			{
				initializer:"initialize"
			}
		)
	})
		describe("setter and getter methods",function(){
			it("Should set price feed", async()=>{
        const  volmexPriceOracle = await upgrades.deployProxy(
					IndexPriceOracle,
					[
					 owner.address,
					],
					{
					 initializer : "initialize"   
			  })
				expect(await volmexBaseToken.setPriceFeed(volmexPriceOracle.address)).to.emit(volmexBaseToken,"PriceFeedChanged").withArgs(volmexPriceOracle.address);
        expect(await volmexBaseToken.getPriceFeed()).to.equal(volmexPriceOracle.address);

			})
	})
})
