import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

describe('Factory', function () {
  let VolmexBaseToken;
  let volmexBaseToken;
  let VirtualTokenTest;
  let virtualTokenTest;
  let Factory;
  let factory;
  let IndexPriceOracle;
  let indexPriceOracle;

  this.beforeAll(async () => {
    Factory = await ethers.getContractFactory("Factory");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VirtualTokenTest = await ethers.getContractFactory("VirtualTokenTest");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
  });

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [
        owner.address,
      ],
      { 
        initializer: "initialize",
      }
    );

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        true, // isBase
        indexPriceOracle.address, // priceFeedArg
      ],
      {
        initializer: "initialize",
      }
    );

    factory = await upgrades.deployProxy(
      Factory,
      [
        volmexBaseToken.address, // implementation
      ],
      {
        initializer: "initialize"
      }
    );

    virtualTokenTest = await upgrades.deployProxy(
      VirtualTokenTest,
      ["VirtualToken", "VTK", false],
      {
        initializer: "initialize"
      }
    );
  });

  describe('Deployment:', function() {
    it("Factory deployed confirm", async () => {
      factory = await upgrades.deployProxy(
        Factory,
        [
          volmexBaseToken.address, // implementation
        ],
        {
          initializer: "initialize"
        }
      );

      let receipt = await factory.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe('Clone:', function() {
    it("Should set implementation contract correctly", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      const tokenImplementation = await factory.tokenImplementation();
      expect(tokenImplementation).equal(volmexBaseToken.address);
    });

    it("Should clone base token", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      const cloneTokenAddress = await factory.tokenByIndex(0);
      expect(cloneTokenAddress).not.equal('0x0000000000000000000000000000000000000000');
    });

    it("Should increment indexCount when cloning a new token", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      let cloneTokenAddress = await factory.indexCount();
      expect(cloneTokenAddress).equal(1);

      await factory.cloneBaseToken("AnotherToken", "ATK", indexPriceOracle.address);
      cloneTokenAddress = await factory.indexCount();
      expect(cloneTokenAddress).equal(2);
    });
  });

  describe('Price Feed', () => {
    it("Should update the priceFeed", async () => {
      const [owner] = await ethers.getSigners();

      let newIndexPriceOracle = await upgrades.deployProxy(
        IndexPriceOracle,
        [owner.address],
        { 
          initializer: "initialize",
        }
      );

      await expect(volmexBaseToken.setPriceFeed(newIndexPriceOracle.address))
        .to.emit(volmexBaseToken, "PriceFeedChanged").withArgs(newIndexPriceOracle.address);
    });

    it("Should return the current priceFeed", async () => {
      const priceFeed = await volmexBaseToken.getPriceFeed();
      expect(priceFeed).to.equal(indexPriceOracle.address);
    });
  });

  describe('Index Price', () => {
    it("Should return the current index price", async () => {
      const volmexBaseTokenIndexPrice = await volmexBaseToken.getIndexPrice(0);
      const priceFeedIndexPrice = await indexPriceOracle.latestRoundData(0);
      expect(volmexBaseTokenIndexPrice).to.equal(priceFeedIndexPrice.answer);
    });
  });

  describe('Virtual Token', () => {
    describe('Deployment', () => {
      it("Should deploy VirtualToken", async () => {
        virtualTokenTest = await upgrades.deployProxy(
          VirtualTokenTest,
          ["VirtualToken", "VTK", false],
          {
            initializer: "initialize"
          }
        );

        let receipt = await virtualTokenTest.deployed();
        expect(receipt.confirmations).not.equal(0);
      });
    });

    describe('Mint', () => {
      it("Should mint max tokens to account", async () => {
        const [owner, account1] = await ethers.getSigners();
        
        await expect(virtualTokenTest.mintMaximumTo(account1.address))
        .to.emit(virtualTokenTest, "Transfer").withArgs(
          '0x0000000000000000000000000000000000000000',
          account1.address,
          '115792089237316195423570985008687907853269984665640564039457584007913129639935' // type(uint256).max
        );
      });
    });

    describe('White list', () => {
      it("Should add account to white list", async () => {
        const [owner, account1] = await ethers.getSigners();
        
        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );
      });

      it("Should return true if white listed account is present", async () => {
        const [owner, account1] = await ethers.getSigners();
        
        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );

        let isInWhitelist = await virtualTokenTest.isInWhitelist(account1.address);
        expect(isInWhitelist).to.equal(true);
      });

      it("Should return false if white listed account is not present", async () => {
        const [owner, account1] = await ethers.getSigners();

        let isInWhitelist = await virtualTokenTest.isInWhitelist(account1.address);
        expect(isInWhitelist).to.equal(false);
      });

      it("Should remove whitelisted account if account balance is 0", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );
        
        expect(await virtualTokenTest.removeWhitelist(account1.address))
          .to.emit(virtualTokenTest, "WhitelistRemoved")
          .withArgs(account1.address);
      });

      it("Should fail to remove whitelisted account if account balance is non-zero", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );

        await expect(virtualTokenTest.mintMaximumTo(account1.address))
        .to.emit(virtualTokenTest, "Transfer").withArgs(
          '0x0000000000000000000000000000000000000000',
          account1.address,
          '115792089237316195423570985008687907853269984665640564039457584007913129639935' // type(uint256).max
        );
        
        await expect(virtualTokenTest.removeWhitelist(account1.address))
          .to.be.revertedWith("VT_BNZ");
      });

      it("Should fail while calling token transfer when from address is not whitelisted", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(
          virtualTokenTest.beforeTokenTransfer(
            owner.address,
            account1.address,
            10,
          )
        ).to.be.revertedWith("VT_NW");
      });

      it("Should call before token transfer", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(owner.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          owner.address
        );

        let receipt = await virtualTokenTest.beforeTokenTransfer(
          owner.address,
          account1.address,
          10,
        );
        expect(receipt.confirmations).not.equal(0);
      });

      it("Should call before token transfer", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(owner.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          owner.address
        );
        
        let receipt = await virtualTokenTest.beforeTokenTransfer(
          '0x0000000000000000000000000000000000000000',
          account1.address,
          10,
        );
        expect(receipt.confirmations).not.equal(0);
      });
    });
  });
});
