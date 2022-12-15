import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { VirtualToken__factory } from "../../typechain";

describe("VirtualToken",function(){
    let VirtualToken;
    let virtualToken;
    let isBase = true;
    let owner, account1, account2;
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
    this.beforeAll(async ()=> {
        VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
        [owner, account1, account2] = await ethers.getSigners();

    })
    //Deploy proxy of virtual token
    beforeEach(async ()=> {

       virtualToken = await upgrades.deployProxy(
        VirtualToken,
        ["MyTestToken",
        "MKT",
        isBase],
        {
        initializer: "__VirtualToken_init"
        })    
        await virtualToken.setMintBurnRole(owner.address) 
    })
    describe("Virtual Token deployment",function(){
      it("should deploy Virtual Token i.e base token",async () =>  {
        virtualToken = await upgrades.deployProxy(
            VirtualToken,
            ["MyTestToken",
            "MKT",
            isBase],
            {
            initializer: "__VirtualToken_init"
        })  
        const receipt = await virtualToken.deployed();
        expect(receipt.confirmations).not.equal(0) 
      })
      it("Should fail to initialize again", async() => {
        await expect(virtualToken.__VirtualToken_init("MyTestToken",
        "MKT",
        !isBase)).to.be.revertedWith("Initializable: contract is not initializing")
      })
      it("should deploy Virtual Token i.e not base token",async () =>  {
        virtualToken = await upgrades.deployProxy(
            VirtualToken,
            ["MyTestToken",
            "MKT",
            !isBase],
            {
            initializer: "__VirtualToken_init"
        })  
        const receipt = await virtualToken.deployed();
        expect(receipt.confirmations).not.equal(0);
      })
    });
    // Set minter burner role and check only admin can grant the role
    describe("set minter burner role",function(){
      it("Should be able to set minter burner role",async () =>  {
        await virtualToken.setMintBurnRole(account1.address)
        expect(await virtualToken.MINTER()).to.not.equal(ZERO_ADDR);

      })
      it("Should fail to set minter role because",async () =>  {
        await expect(virtualToken.connect(account1).setMintBurnRole(account1.address))
        .to.be.revertedWith("VirtualToken: Not admin");
      })

    })
   describe("Mint and burn Tokens",function(){
    it("should mint tokens",async () => {
      await virtualToken.mint(account1.address,10000000);
      expect( await virtualToken.balanceOf(account1.address)).to.be.equal(10000000);
    })
    it("should burn tokens",async () => {
      await virtualToken.mint(account1.address,10000000);
      expect( await virtualToken.balanceOf(account1.address)).to.be.equal(10000000);
      await virtualToken.addWhitelist(account1.address);
      await virtualToken.burn(account1.address,5000000);
      expect(await virtualToken.balanceOf(account1.address)).to.be.equal(5000000);
    })
    it("should mint maximum tokens",async ()=> {
      await virtualToken.mintMaximumTo(account1.address);
      expect( await virtualToken.balanceOf(account1.address)).to.be.equal("115792089237316195423570985008687907853269984665640564039457584007913129639935");
    })
    it("should fail to mint tokens",async ()=> {
      await expect(virtualToken.connect(account1).mint(account2.address,100000)).to.be.revertedWith("VirtualToken: Not minter");
      
    })
    it("should fail to burn tokens",async ()=> {
      await virtualToken.mint(account1.address,10000000);
      await expect(virtualToken.connect(account1).burn(account2.address,100000)).to.be.revertedWith("VirtualToken: Not burner");
      
    })
   }) 
   describe("Add and Remove user from white list",function(){
    it("Add user to white list",async () => { 
      expect(await virtualToken.addWhitelist(account1.address)).to.emit(virtualToken,"WhitelistAdded").withArgs(account1.address);
      expect(await virtualToken.isInWhitelist(account1.address)).to.be.equal(true);

    })
    it("Remove user to white list",async () => { 
      expect(await virtualToken.addWhitelist(account1.address)).to.emit(virtualToken,"WhitelistAdded").withArgs(account1.address);
      expect(await virtualToken.isInWhitelist(account1.address)).to.be.equal(true);
      expect(await virtualToken.removeWhitelist(account1.address)).to.emit(virtualToken,"WhitelistRemoved").withArgs(account1.address);
      expect(await virtualToken.isInWhitelist(account1.address)).to.be.equal(false);
      
    })
   })
  

})